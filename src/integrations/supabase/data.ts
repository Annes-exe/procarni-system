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

  let materials = relations.map(sm => ({
    ...sm.materials,
    specification: sm.specification,
  })).filter(m => m !== null);

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
  getQuotesByMaterial, // NEW
  createOrUpdateQuote, // NEW
  deleteQuote, // NEW
  getAllQuoteComparisons, // NEW
  getQuoteComparisonById, // NEW
  createQuoteComparison, // NEW
  updateQuoteComparison, // NEW
  deleteQuoteComparison, // NEW
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