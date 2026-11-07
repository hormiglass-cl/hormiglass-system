"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import type { Proveedor } from "../../lib/types";
import { mensajeError } from "../../lib/errores";
import {
  Plus,
  Upload,
  Download,
  AlertTriangle,
  AlertCircle,
  Search,
  Trash2,
} from "lucide-react";
import { Pagination } from "../../components/Pagination";
import { Button, CodeStamp, Dialog, Panel } from "../../components/ui/crm";
import { useConfirm, useToast } from "../../components/ui/feedback";
import { AvatarBadge } from "../../components/ui/AvatarBadge";
import { ColumnMenu, useColumnPrefs } from "../../components/ui/ColumnMenu";
import { FloatingActionBar } from "../../components/ui/FloatingActionBar";
import {
  FilterMenu,
  FilterBar,
  useFilterUi,
  FilterDefinition,
  matchMultiFilter,
  matchNumberFilter,
} from "../../components/ui/FilterPills";
import {
  validarRutChileno,
  parseProveedoresFile,
  generarPlantillaProveedoresCsv,
  generarPlantillaProveedoresXlsx,
  type ProveedorImportado,
} from "../../lib/proveedores-csv";

type ProveedorCol = "rut" | "rubro" | "contacto" | "correo" | "telefono" | "comuna" | "ordenes";

const COLUMN_ORDER: ProveedorCol[] = ["rut", "rubro", "contacto", "correo", "telefono", "comuna", "ordenes"];

const DEFAULT_COLUMNS: Record<ProveedorCol, boolean> = {
  rut: true,
  rubro: true,
  contacto: true,
  correo: true,
  telefono: true,
  comuna: true,
  ordenes: true,
};

const COLUMN_LABELS: Record<ProveedorCol, string> = {
  rut: "RUT",
  rubro: "Rubro",
  contacto: "Contacto",
  correo: "Correo",
  telefono: "Teléfono",
  comuna: "Comuna",
  ordenes: "Órdenes de compra",
};

const PROVEEDOR_COL_HEAD: Record<ProveedorCol, string> = { ...COLUMN_LABELS, ordenes: "Órdenes" };

const PROVEEDOR_COL_WIDTH: Record<ProveedorCol, string> = {
  rut: "min-w-[120px]",
  rubro: "min-w-[140px]",
  contacto: "min-w-[160px]",
  correo: "min-w-[200px]",
  telefono: "min-w-[130px]",
  comuna: "min-w-[120px]",
  ordenes: "min-w-[110px]",
};

export default function ProveedoresPage() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const confirmDialog = useConfirm();
  const filterUi = useFilterUi();

  const router = useRouter();
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [ordenes, setOrdenes] = useState<{ proveedor_id: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>(
    {},
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Columnas: visibilidad y orden (se recuerdan en este navegador)
  const colPrefs = useColumnPrefs<ProveedorCol>("hormiglass_proveedor_cols_v1", COLUMN_ORDER, DEFAULT_COLUMNS);

  // Formulario de proveedor
  const [showProvModal, setShowProvModal] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [nombreProv, setNombreProv] = useState("");
  const [rutProv, setRutProv] = useState("");
  const [rubroProv, setRubroProv] = useState("");
  const [contactoProv, setContactoProv] = useState("");
  const [telefonoProv, setTelefonoProv] = useState("");
  const [correoProv, setCorreoProv] = useState("");
  const [direccionProv, setDireccionProv] = useState("");
  const [comunaProv, setComunaProv] = useState("");

  // Importación masiva
  const [showImportModal, setShowImportModal] = useState(false);
  const [preview, setPreview] = useState<ProveedorImportado[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    const [provRes, ocRes] = await Promise.all([
      supabase.from("proveedores").select("*").order("nombre"),
      supabase.from("ordenes_compra").select("proveedor_id"),
    ]);
    if (provRes.error || ocRes.error) {
      console.error("Error loading proveedores:", provRes.error || ocRes.error);
      setLoadError(
        "No se pudieron cargar los proveedores. Reintenta más tarde.",
      );
    } else {
      setLoadError(null);
      setProveedores((provRes.data || []) as Proveedor[]);
      setOrdenes((ocRes.data || []) as { proveedor_id: string }[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    let debounceTimer: number | null = null;
    const initial = window.setTimeout(() => {
      void loadData();
    }, 0);
    const reload = () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        void loadData();
      }, 300);
    };
    const channel = supabase
      .channel("proveedores_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "proveedores" },
        reload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ordenes_compra" },
        reload,
      )
      .subscribe();
    return () => {
      window.clearTimeout(initial);
      if (debounceTimer) window.clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [supabase, loadData]);

  const rutValidation = useMemo(() => {
    if (!rutProv.trim()) return null;
    return validarRutChileno(rutProv, { estricto: false });
  }, [rutProv]);

  const ordenesPorProveedor = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of ordenes)
      map.set(o.proveedor_id, (map.get(o.proveedor_id) ?? 0) + 1);
    return map;
  }, [ordenes]);

  const filterDefinitions: FilterDefinition[] = useMemo(() => {
    const unique = (values: (string | undefined)[]) =>
      [...new Set(values.filter((v): v is string => Boolean(v?.trim())))]
        .sort((a, b) => a.localeCompare(b, "es"))
        .map((v) => ({ value: v, label: v }));
    return [
      {
        id: "rubro",
        label: "Rubro",
        allLabel: "Todos los rubros",
        options: unique(proveedores.map((p) => p.rubro)),
      },
      {
        id: "comuna",
        label: "Comuna",
        allLabel: "Todas las comunas",
        options: unique(proveedores.map((p) => p.comuna)),
      },
      {
        id: "ordenes",
        label: "Órdenes de compra",
        type: "number",
        options: [],
      },
    ];
  }, [proveedores]);

  const filteredProveedores = useMemo(() => {
    const q = search.toLowerCase().trim();
    const qRut = q.replace(/[^0-9kK]/g, "");
    return proveedores.filter((p) => {
      const rutClean = (p.rut || "").replace(/[^0-9kK]/g, "").toLowerCase();
      const matchSearch =
        !q ||
        p.nombre?.toLowerCase().includes(q) ||
        p.contacto?.toLowerCase().includes(q) ||
        p.comuna?.toLowerCase().includes(q) ||
        p.rubro?.toLowerCase().includes(q) ||
        p.correo?.toLowerCase().includes(q) ||
        Boolean(qRut && rutClean.includes(qRut));
      return (
        matchSearch &&
        matchMultiFilter(activeFilters.rubro, (v) => p.rubro === v) &&
        matchMultiFilter(activeFilters.comuna, (v) => p.comuna === v) &&
        matchNumberFilter(
          activeFilters.ordenes,
          ordenesPorProveedor.get(p.id) ?? 0,
        )
      );
    });
  }, [proveedores, search, activeFilters, ordenesPorProveedor]);

  const totalItems = filteredProveedores.length;
  const from = (currentPage - 1) * itemsPerPage;
  const paginatedProveedores = filteredProveedores.slice(
    from,
    from + itemsPerPage,
  );

  // ----- Selección y borrado -----
  const isAllSelected =
    filteredProveedores.length > 0 &&
    selectedIds.length === filteredProveedores.length;
  const toggleSelectAll = () =>
    setSelectedIds(isAllSelected ? [] : filteredProveedores.map((p) => p.id));
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const ok = await confirmDialog({
      title: "Eliminar proveedores",
      message: `¿Seguro que deseas eliminar los ${selectedIds.length} proveedores seleccionados? Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar selección",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase
      .from("proveedores")
      .delete()
      .in("id", selectedIds);
    if (error) {
      toast({
        message: mensajeError(
          error,
          "No se pudieron eliminar. Revisa que no tengan órdenes de compra asociadas.",
        ),
        tone: "danger",
      });
      return;
    }
    setProveedores((prev) => prev.filter((p) => !selectedIds.includes(p.id)));
    toast({
      message: `${selectedIds.length} proveedor(es) eliminados correctamente.`,
      tone: "success",
    });
    setSelectedIds([]);
  };

  // ----- Nuevo proveedor -----
  const resetForm = () => {
    setFormError("");
    setNombreProv("");
    setRutProv("");
    setRubroProv("");
    setContactoProv("");
    setTelefonoProv("");
    setCorreoProv("");
    setDireccionProv("");
    setComunaProv("");
  };

  const openProvModal = () => {
    resetForm();
    setShowProvModal(true);
  };

  const handleAddProveedor = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!nombreProv.trim() || !rutProv.trim()) {
      setFormError("Completa los campos requeridos (*).");
      return;
    }
    const val = validarRutChileno(rutProv, { estricto: false });
    if (!val.valido) {
      setFormError(`RUT inválido: ${val.mensaje}`);
      return;
    }
    const rutFinal = val.rutFormateado || rutProv.trim();
    if (proveedores.some((p) => p.rut === rutFinal)) {
      setFormError(`Ya existe un proveedor con el RUT ${rutFinal}.`);
      return;
    }

    setSaving(true);
    const { data, error } = await supabase
      .from("proveedores")
      .insert([
        {
          nombre: nombreProv.trim(),
          rut: rutFinal,
          rubro: rubroProv.trim() || null,
          contacto: contactoProv.trim() || null,
          telefono: telefonoProv.trim() || null,
          correo: correoProv.trim().toLowerCase() || null,
          direccion: direccionProv.trim() || null,
          comuna: comunaProv.trim() || null,
        },
      ])
      .select()
      .single();
    setSaving(false);

    if (error || !data) {
      console.error("Error adding proveedor:", error);
      setFormError(mensajeError(error, "No se pudo guardar el proveedor."));
      return;
    }
    setProveedores((prev) =>
      [...prev, data as Proveedor].sort((a, b) =>
        a.nombre.localeCompare(b.nombre, "es"),
      ),
    );
    toast({
      message: `Proveedor ${nombreProv.trim()} registrado exitosamente.`,
      tone: "success",
    });
    setShowProvModal(false);
    resetForm();
  };

  // ----- Importación masiva -----
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const { rows, errors, warnings } = parseProveedoresFile(buffer);
      setPreview(rows);
      setImportErrors(errors);
      setImportWarnings(warnings);
    } catch (err) {
      setImportErrors([`Error al leer el archivo: ${(err as Error).message}`]);
      setPreview([]);
      setImportWarnings([]);
    }
  };

  const handleConfirmImport = async () => {
    if (preview.length === 0) return;
    setImporting(true);
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "upsert_proveedores_masivo",
        {
          p_proveedores: preview,
        },
      );
      if (!rpcError && rpcData) {
        toast({
          message: `Carga exitosa: ${rpcData.insertados ?? 0} proveedores agregados, ${rpcData.actualizados ?? 0} actualizados.`,
          tone: "success",
        });
      } else {
        const payload = preview.map((p) => ({
          rut: p.rut,
          nombre: p.nombre,
          contacto: p.contacto || null,
          telefono: p.telefono || null,
          correo: p.correo || null,
          direccion: p.direccion || null,
          comuna: p.comuna || null,
          region: p.region || null,
          rubro: p.rubro || null,
          activo: true,
        }));
        const { error: upsertErr } = await supabase
          .from("proveedores")
          .upsert(payload, { onConflict: "rut" });
        if (upsertErr) throw upsertErr;
        toast({
          message: `${preview.length} proveedores importados exitosamente.`,
          tone: "success",
        });
      }
      setShowImportModal(false);
      setPreview([]);
      setImportErrors([]);
      setImportWarnings([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadData();
    } catch (err) {
      console.error("Error importing proveedores:", err);
      toast({
        message:
          "No se pudo completar la importación. Revisa los datos del archivo.",
        tone: "danger",
      });
    } finally {
      setImporting(false);
    }
  };

  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsvTemplate = () => {
    download(
      new Blob([generarPlantillaProveedoresCsv()], {
        type: "text/csv;charset=utf-8;",
      }),
      "plantilla_proveedores_hormiglass.csv",
    );
    toast({ message: "Plantilla CSV descargada.", tone: "info" });
  };

  const handleDownloadXlsxTemplate = () => {
    download(
      new Blob([generarPlantillaProveedoresXlsx() as unknown as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      "plantilla_proveedores_hormiglass.xlsx",
    );
    toast({ message: "Plantilla Excel descargada.", tone: "info" });
  };

  const visibleColCount = 2 + colPrefs.visibleOrder.length;

  return (
    <div className="space-y-4">
      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-surface-muted p-1">
          <div className="relative w-full sm:w-96">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              aria-label="Buscar proveedores"
              placeholder="Buscar proveedor, RUT o rubro..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="min-h-9 w-full rounded-lg border border-line-subtle bg-surface pl-8 pr-3 text-[13px] text-ink shadow-[var(--hg-shadow-card)] placeholder:text-ink-muted focus:border-accent focus:outline-none"
            />
          </div>

          <>
            <ColumnMenu labels={COLUMN_LABELS} prefs={colPrefs} />
            <FilterMenu
              triggerClassName="min-h-9 justify-center rounded-lg px-2.5 text-[13px]"
              filters={filterDefinitions}
              activeFilters={activeFilters}
              ui={filterUi}
            />
          </>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={handleDownloadXlsxTemplate}>
            <Download className="w-4 h-4" />
            <span>Plantilla Excel</span>
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setPreview([]);
              setImportErrors([]);
              setImportWarnings([]);
              setShowImportModal(true);
            }}
          >
            <Upload className="w-4 h-4" />
            <span>Importar</span>
          </Button>
          <Button variant="primary" onClick={openProvModal}>
            <Plus className="w-4 h-4" />
            <span>Nuevo proveedor</span>
          </Button>
        </div>
      </div>

      <FilterBar
        filters={filterDefinitions}
        activeFilters={activeFilters}
        onFilterChange={(id, val) => {
          setCurrentPage(1);
          setActiveFilters((prev) => ({ ...prev, [id]: val }));
        }}
        onClearAll={() => {
          setActiveFilters({});
          setSearch("");
        }}
        ui={filterUi}
      />

      {loadError && (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger"
        >
          {loadError}
        </div>
      )}

      <Panel className="overflow-hidden">
        {/* Móvil */}
        <div className="md:hidden divide-y divide-line-subtle">
          {loading ? (
            <p className="p-5 text-sm text-ink-muted">Cargando proveedores…</p>
          ) : loadError ? null : paginatedProveedores.length === 0 ? (
            <p className="p-5 text-sm text-ink-muted">
              No se encontraron proveedores.
            </p>
          ) : (
            paginatedProveedores.map((p) => (
              <div
                key={p.id}
                onClick={() => router.push(`/proveedores/${p.id}`)}
                className="p-3 flex items-center gap-2.5 cursor-pointer hover:bg-surface-muted/60 transition"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(p.id)}
                  onChange={() => toggleSelect(p.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Seleccionar ${p.nombre}`}
                  className="shrink-0 accent-accent"
                />
                <AvatarBadge name={p.nombre} size="sm" className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/proveedores/${p.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="block truncate text-sm font-semibold text-ink hover:text-accent-ink"
                  >
                    {p.nombre}
                  </Link>
                  <span className="block truncate text-[11px] text-ink-muted t-num">
                    {p.rut} · {p.rubro || "Sin rubro"}
                  </span>
                </div>
                <span className="text-[11px] text-ink-muted t-num font-semibold shrink-0">
                  {ordenesPorProveedor.get(p.id) ?? 0} OC
                </span>
              </div>
            ))
          )}
        </div>

        {/* Escritorio */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left min-w-[900px] text-[13px]">
            <thead>
              <tr className="bg-surface-muted/60 text-ink-muted text-xs font-medium border-b border-line">
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    aria-label="Seleccionar todos los proveedores"
                    className="rounded cursor-pointer accent-accent"
                  />
                </th>
                <th className="py-3 px-3 min-w-[240px] font-medium">
                  Proveedor
                </th>
                {colPrefs.visibleOrder.map((k) => (
                  <th key={k} className={`py-3 px-3 font-medium ${PROVEEDOR_COL_WIDTH[k]}`}>
                    {PROVEEDOR_COL_HEAD[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle text-ink">
              {loading ? (
                [...Array(6)].map((_, idx) => (
                  <tr key={`skel-prov-${idx}`} className="animate-pulse">
                    <td className="py-3 px-3">
                      <div className="w-4 h-4 rounded bg-surface-muted hg-skeleton mx-auto" />
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-surface-muted hg-skeleton shrink-0" />
                        <div className="h-3.5 w-36 rounded bg-surface-muted hg-skeleton" />
                      </div>
                    </td>
                    {Array.from({ length: visibleColCount - 2 }).map(
                      (__, i) => (
                        <td key={i} className="py-3 px-3">
                          <div className="h-3.5 w-24 rounded bg-surface-muted hg-skeleton" />
                        </td>
                      ),
                    )}
                  </tr>
                ))
              ) : loadError ? null : filteredProveedores.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleColCount}
                    className="py-8 text-center text-ink-muted font-medium"
                  >
                    No se encontraron proveedores registrados.
                  </td>
                </tr>
              ) : (
                paginatedProveedores.map((p) => {
                  const isSelected = selectedIds.includes(p.id);
                  const cells: Record<ProveedorCol, React.ReactNode> = {
                    rut: (
                      <td className="py-3 px-3">
                        <span className="t-num text-ink">{p.rut}</span>
                      </td>
                    ),
                    rubro: (
                      <td className="py-3 px-3 text-ink">
                        {p.rubro || <span className="text-ink-muted">—</span>}
                      </td>
                    ),
                    contacto: (
                      <td className="py-3 px-3 text-ink">
                        {p.contacto || <span className="text-ink-muted">—</span>}
                      </td>
                    ),
                    correo: (
                      <td className="py-3 px-3">
                        {p.correo ? (
                          <span className="block max-w-[220px] truncate text-ink" title={p.correo}>
                            {p.correo}
                          </span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                    ),
                    telefono: (
                      <td className="py-3 px-3">
                        {p.telefono ? (
                          <span className="t-num text-ink">{p.telefono}</span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                    ),
                    comuna: (
                      <td className="py-3 px-3 text-ink">
                        {p.comuna || <span className="text-ink-muted">—</span>}
                      </td>
                    ),
                    ordenes: (
                      <td className="py-3 px-3">
                        <span className="t-num text-ink">{ordenesPorProveedor.get(p.id) ?? 0}</span>
                      </td>
                    ),
                  };
                  return (
                    <tr
                      key={p.id}
                      onClick={() => router.push(`/proveedores/${p.id}`)}
                      className={`hover:bg-surface-muted/60 transition cursor-pointer border-b border-line-subtle ${isSelected ? "bg-surface-muted/90" : ""}`}
                    >
                      <td
                        className="py-3 px-3 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(p.id)}
                          aria-label={`Seleccionar ${p.nombre}`}
                          className="rounded cursor-pointer accent-accent"
                        />
                      </td>
                      <td className="py-3 px-3 font-semibold">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <AvatarBadge
                            name={p.nombre}
                            size="md"
                            className="shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/proveedores/${p.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="block truncate text-[13px] font-semibold leading-tight text-ink hover:text-accent-ink hover:underline transition"
                            >
                              {p.nombre}
                            </Link>
                          </div>
                        </div>
                      </td>
                      {colPrefs.visibleOrder.map((k) => (
                        <React.Fragment key={k}>{cells[k]}</React.Fragment>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={setItemsPerPage}
        />
      </Panel>

      {/* Registrar nuevo proveedor */}
      <Dialog
        open={showProvModal}
        onClose={() => setShowProvModal(false)}
        title="Registrar nuevo proveedor"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowProvModal(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="form-proveedor"
              disabled={saving}
            >
              {saving ? "Guardando..." : "Guardar proveedor"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="bg-danger/10 border border-danger/30 text-danger p-3 rounded-md text-xs flex items-center gap-2 font-semibold"
            >
              <AlertCircle className="w-4 h-4 text-danger shrink-0" />
              <span>{formError}</span>
            </div>
          )}
          <form
            id="form-proveedor"
            onSubmit={handleAddProveedor}
            className="space-y-4 text-xs"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-ink mb-1">
                  RUT empresa *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. 90.120.000-4"
                  value={rutProv}
                  onChange={(e) => setRutProv(e.target.value)}
                  className="hg-field-compact w-full t-num"
                />
                {rutValidation && (
                  <p
                    className={`mt-1 t-caption font-medium ${
                      rutValidation.valido && rutValidation.dvCorrecto
                        ? "text-accent-ink"
                        : rutValidation.valido
                          ? "text-warning"
                          : "text-danger"
                    }`}
                  >
                    {rutValidation.valido && rutValidation.dvCorrecto
                      ? `✓ RUT válido (${rutValidation.rutFormateado})`
                      : rutValidation.valido
                        ? `⚠ ${rutValidation.mensaje}`
                        : `✗ ${rutValidation.mensaje}`}
                  </p>
                )}
              </div>
              <div>
                <label className="block font-semibold text-ink mb-1">
                  Nombre o razón social *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Cemento Polpaico S.A."
                  value={nombreProv}
                  onChange={(e) => setNombreProv(e.target.value)}
                  className="hg-field-compact w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-ink mb-1">
                  Rubro / especialidad
                </label>
                <input
                  type="text"
                  placeholder="Ej. Áridos, Prefabricados, Fierro"
                  value={rubroProv}
                  onChange={(e) => setRubroProv(e.target.value)}
                  className="hg-field-compact w-full"
                />
              </div>
              <div>
                <label className="block font-semibold text-ink mb-1">
                  Persona de contacto
                </label>
                <input
                  type="text"
                  placeholder="Ej. Juan Pérez - Mesa de Ventas"
                  value={contactoProv}
                  onChange={(e) => setContactoProv(e.target.value)}
                  className="hg-field-compact w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-ink mb-1">
                  Teléfono
                </label>
                <input
                  type="text"
                  placeholder="+56 2 2700 8000"
                  value={telefonoProv}
                  onChange={(e) => setTelefonoProv(e.target.value)}
                  className="hg-field-compact w-full t-num"
                />
              </div>
              <div>
                <label className="block font-semibold text-ink mb-1">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  placeholder="ventas@proveedor.cl"
                  value={correoProv}
                  onChange={(e) => setCorreoProv(e.target.value)}
                  className="hg-field-compact w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-ink mb-1">
                  Dirección (calle y número)
                </label>
                <input
                  type="text"
                  placeholder="Av. Industrial 123"
                  value={direccionProv}
                  onChange={(e) => setDireccionProv(e.target.value)}
                  className="hg-field-compact w-full"
                />
              </div>
              <div>
                <label className="block font-semibold text-ink mb-1">
                  Comuna
                </label>
                <input
                  type="text"
                  placeholder="San Bernardo"
                  value={comunaProv}
                  onChange={(e) => setComunaProv(e.target.value)}
                  className="hg-field-compact w-full"
                />
              </div>
            </div>
          </form>
        </div>
      </Dialog>

      {/* Importar proveedores */}
      <Dialog
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Importar proveedores desde archivo (CSV / Excel)"
        description="Sube una planilla con el listado de proveedores para incorporarlos automáticamente al sistema."
        size="lg"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowImportModal(false)}
            >
              Cerrar
            </Button>
            {preview.length > 0 && (
              <Button
                variant="primary"
                onClick={handleConfirmImport}
                disabled={importing}
              >
                {importing
                  ? "Importando..."
                  : `Confirmar e importar (${preview.length})`}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-surface-muted rounded-lg border border-line">
            <div className="space-y-0.5">
              <p className="font-semibold text-xs text-ink">
                ¿Aún no tienes el formato?
              </p>
              <p className="t-caption text-ink-muted">
                Descarga la plantilla oficial con columnas obligatorias y
                ejemplos validados.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownloadXlsxTemplate}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownloadCsvTemplate}
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </Button>
            </div>
          </div>

          <div className="border-2 border-dashed border-line rounded-lg p-6 text-center space-y-3 bg-surface hover:bg-surface-muted transition">
            <Upload className="w-8 h-8 text-accent-ink mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-ink">
                Selecciona tu archivo
              </p>
              <p className="t-caption text-ink-muted">
                Formatos soportados: .xlsx, .xls, .csv
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              onChange={handleFileChange}
              className="block w-full text-xs text-ink file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-accent-soft file:text-accent-ink hover:file:bg-accent-soft/80 cursor-pointer"
            />
          </div>

          {importErrors.length > 0 && (
            <div className="rounded-md border border-danger-line bg-danger-soft p-3 space-y-1 text-xs text-danger max-h-36 overflow-auto">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  Se encontraron observaciones que requieren revisión:
                </span>
              </div>
              {importErrors.map((msg, i) => (
                <p key={i}>• {msg}</p>
              ))}
            </div>
          )}

          {importWarnings.length > 0 && (
            <div className="rounded-md border border-warning-line bg-warning-soft p-3 space-y-1 text-xs text-warning max-h-32 overflow-auto">
              <p className="font-semibold">Avisos informativos:</p>
              {importWarnings.map((msg, i) => (
                <p key={i}>• {msg}</p>
              ))}
            </div>
          )}

          {preview.length > 0 && (
            <div className="space-y-2">
              <p className="font-semibold text-xs text-ink">
                {preview.length} proveedor(es) listos para importar
              </p>
              <div className="max-h-64 overflow-auto rounded-lg border border-line">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="text-ink-muted font-medium border-b border-line">
                      <th className="py-2.5 px-3 font-medium">RUT</th>
                      <th className="py-2.5 px-3 font-medium">Razón social</th>
                      <th className="py-2.5 px-3 font-medium">Rubro</th>
                      <th className="py-2.5 px-3 font-medium">Contacto</th>
                      <th className="py-2.5 px-3 font-medium">Comuna</th>
                      <th className="py-2.5 px-3 font-medium">Teléfono</th>
                      <th className="py-2.5 px-3 font-medium">Correo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-subtle">
                    {preview.slice(0, 50).map((row, idx) => (
                      <tr
                        key={`${row.rut}-${idx}`}
                        className="hover:bg-surface-muted"
                      >
                        <td className="py-2 px-3">
                          <CodeStamp>{row.rut}</CodeStamp>
                        </td>
                        <td className="py-2 px-3 font-medium text-ink">
                          {row.nombre}
                        </td>
                        <td className="py-2 px-3 text-ink-muted">
                          {row.rubro || "-"}
                        </td>
                        <td className="py-2 px-3 text-ink-muted">
                          {row.contacto || "-"}
                        </td>
                        <td className="py-2 px-3 text-ink-muted">
                          {row.comuna || "-"}
                        </td>
                        <td className="py-2 px-3 text-ink-muted">
                          {row.telefono || "-"}
                        </td>
                        <td className="py-2 px-3 text-ink-muted">
                          {row.correo || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 50 && (
                  <div className="p-2.5 bg-surface-muted text-center text-xs text-ink-muted border-t border-line">
                    Mostrando los primeros 50 de {preview.length} registros.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Dialog>

      <FloatingActionBar
        selectedCount={selectedIds.length}
        onClearSelection={() => setSelectedIds([])}
        itemLabel="proveedores"
      >
        <Button
          variant="destructive"
          size="sm"
          onClick={() => void handleDeleteSelected()}
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Eliminar ({selectedIds.length})</span>
        </Button>
      </FloatingActionBar>
    </div>
  );
}
