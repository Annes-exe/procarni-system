import { supabase } from './client';
import { showError } from '@/utils/toast';
import {
  getAllSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  searchSuppliers,
  getSupplierDetails,
  getAllMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  searchMaterials,
  getAllCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
  searchCompanies,
  getAllQuoteRequests,
  createQuoteRequest,
  updateQuoteRequest,
  deleteQuoteRequest,
  getQuoteRequestDetails,
  archiveQuoteRequest, // Exported
  unarchiveQuoteRequest, // Exported
  updateQuoteRequestStatus, // NEW
  getAllPurchaseOrders,
  createPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  getPurchaseOrderDetails,
  archivePurchaseOrder,
  unarchivePurchaseOrder,
  updatePurchaseOrderStatus, // NEW
  createSupplierMaterialRelation,
  uploadFichaTecnica,
  getAllFichasTecnicas,
  deleteFichaTecnica,
  getFichaTecnicaBySupplierAndProduct, // Exported
  getPriceHistoryByMaterialId, // Exported
  getAllAuditLogs, // NEW: Exported
  logAudit, // NEW: Exported
  getQuotesByMaterial, // NEW: Exported
  createOrUpdateQuote, // NEW: Exported
  deleteQuote, // NEW: Exported
  getAllQuoteComparisons, // NEW: Exported
  getQuoteComparisonById, // NEW: Exported
  createQuoteComparison, // NEW: Exported
  updateQuoteComparison, // NEW: Exported
  deleteQuoteComparison, // NEW: Exported
  // --- NEW SERVICE ORDER EXPORTS ---
  getAllServiceOrders,
  createServiceOrder,
  updateServiceOrder,
  deleteServiceOrder,
  getServiceOrderDetails,
  archiveServiceOrder,
  unarchiveServiceOrder,
  updateServiceOrderStatus,
} from './services';

// Funciones adicionales que no encajan directamente en un servicio CRUD
export const getSuppliersByMaterial = async (materialId: string): Promise<any[]> => {
  const { data, error } = await supabase
    .from('supplier_materials')
    .select('*, suppliers(*)')
    .eq('material_id', materialId);

  if (error) {
    console.error('[getSuppliersByMaterial] Error:', error);
    return [];
  }

  return data.map(sm => ({
    ...sm.suppliers,
    specification: sm.specification,
  }));
};

// NEW FUNCTION: Search suppliers associated with a specific material
export const searchSuppliersByMaterial = async (materialId: string, query: string): Promise<any[]> => {
  if (!materialId) {
    return [];
  }

  let selectQuery = supabase
    .from('supplier_materials')
    .select(`
      suppliers!inner (
        id,
        name,
        rif,
        code
      ),
      specification
    `)
    .eq('material_id', materialId);

  const { data: relations, error } = await selectQuery;

  if (error) {
    console.error('[searchSuppliersByMaterial] Error:', error);
    return [];
  }

  let suppliers = relations.map(sm => {
    const sup = sm.suppliers as any;
    return {
      ...sup,
      specification: sm.specification,
    }
  });

  // Client-side filtering based on query
  if (query.trim()) {
    const lowerCaseQuery = query.toLowerCase();
    suppliers = suppliers.filter(s =>
      s.name.toLowerCase().includes(lowerCaseQuery) ||
      (s.rif && s.rif.toLowerCase().includes(lowerCaseQuery)) ||
      (s.code && s.code.toLowerCase().includes(lowerCaseQuery))
    );
  }

  return suppliers;
};

// NEW FUNCTION: Search materials associated with a specific supplier
export const searchMaterialsBySupplier = async (supplierId: string, query: string): Promise<any[]> => {
  if (!supplierId) {
    return [];
  }

  let selectQuery = supabase
    .from('supplier_materials')
    .select('materials:material_id(id, name, code, category, unit, is_exempt), specification')
    .eq('supplier_id', supplierId);

  // Eliminamos el límite de 50 en la consulta a Supabase para obtener todos los asociados.
  const { data: relations, error } = await selectQuery;

  if (error) {
    console.error('[searchMaterialsBySupplier] Error:', error);
    return [];
  }

  let materials = relations.map(sm => {
    // Force cast to any to avoid TS error on join
    const mat = sm.materials as any;
    if (!mat) return null;

    return {
      ...mat,
      specification: sm.specification,
    };
  }).filter(m => m !== null);

  // Client-side filtering based on query
  if (query.trim()) {
    const lowerCaseQuery = query.toLowerCase();
    materials = materials.filter(m =>
      m.name.toLowerCase().includes(lowerCaseQuery) ||
      (m.code && m.code.toLowerCase().includes(lowerCaseQuery))
    );
  }

  // Eliminamos el límite de 10 en el cliente. Devolvemos todos los resultados filtrados.
  return materials;
};

// NEW FUNCTION: Get Purchase History Report with filters
export const getPurchaseHistoryReport = async ({
  supplierId,
  materialId,
  startDate,
  endDate,
  status
}: {
  supplierId?: string;
  materialId?: string;
  startDate?: Date;
  endDate?: Date;
  status?: string;
}) => {
  let query = supabase
    .from('purchase_order_items')
    .select(`
      *,
      purchase_orders!inner (
        id,
        sequence_number,
        created_at,
        status,
        currency,
        exchange_rate,
        supplier_id,
        suppliers (
          name,
          rif
        )
      ),
      materials (
        name,
        code,
        category,
        unit
      )
    `)
    .order('created_at', { ascending: false });

  if (supplierId) {
    query = query.eq('purchase_orders.supplier_id', supplierId);
  }

  if (materialId) {
    query = query.eq('material_id', materialId);
  }

  if (startDate) {
    query = query.gte('created_at', startDate.toISOString());
  }

  if (endDate) {
    // Set time to end of day for the end date to include the full day
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);
    query = query.lte('created_at', endOfDay.toISOString());
  }

  if (status) {
    query = query.eq('purchase_orders.status', status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[getPurchaseHistoryReport] Error:', error);
    return [];
  }

  return data;
};

// Exportaciones individuales para mantener compatibilidad
export {
  getAllSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  searchSuppliers,
  getSupplierDetails,
  getAllMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  searchMaterials,
  getAllCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
  searchCompanies,
  getAllQuoteRequests,
  createQuoteRequest,
  updateQuoteRequest,
  deleteQuoteRequest,
  getQuoteRequestDetails,
  archiveQuoteRequest,
  unarchiveQuoteRequest,
  updateQuoteRequestStatus,
  getAllPurchaseOrders,
  createPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  getPurchaseOrderDetails,
  archivePurchaseOrder,
  unarchivePurchaseOrder,
  updatePurchaseOrderStatus,
  createSupplierMaterialRelation,
  uploadFichaTecnica,
  getAllFichasTecnicas,
  deleteFichaTecnica,
  getFichaTecnicaBySupplierAndProduct,
  getPriceHistoryByMaterialId,
  getAllAuditLogs,
  logAudit,
  getQuotesByMaterial,
  createOrUpdateQuote,
  deleteQuote,
  getAllQuoteComparisons,
  getQuoteComparisonById,
  createQuoteComparison,
  updateQuoteComparison,
  deleteQuoteComparison,
  // --- NEW SERVICE ORDER EXPORTS ---
  getAllServiceOrders,
  createServiceOrder,
  updateServiceOrder,
  deleteServiceOrder,
  getServiceOrderDetails,
  archiveServiceOrder,
  unarchiveServiceOrder,
  updateServiceOrderStatus,
};