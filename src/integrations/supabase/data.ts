import { supabase } from './client';
import { showError } from '@/utils/toast';
import {
  getAllUnits,
  createUnit,
  deleteUnit,
  getAllMaterialCategories,
  createMaterialCategory,
  deleteMaterialCategory,
} from './services';
import {
  getAllSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  searchSuppliers,
  getSupplierDetails,
  getPaginatedSuppliers,
  getAllMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  searchMaterials,
  searchMaterialsAndCategories,
  getRecentMaterials,
  getMaterialByName,
  getPaginatedMaterials,
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
  // getAllPurchaseOrders, // Removed
  // createPurchaseOrder, // Removed
  // updatePurchaseOrder, // Removed
  // deletePurchaseOrder, // Removed
  // getPurchaseOrderDetails, // Removed
  // archivePurchaseOrder, // Removed
  // unarchivePurchaseOrder, // Removed
  // updatePurchaseOrderStatus, // NEW - Removed
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
    unit_id: sm.unit_id,
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
        code,
        city,
        email,
        phone,
        phone_2,
        instagram,
        payment_terms,
        credit_days,
        status
      ),
      specification
    `)
    .eq('material_id', materialId)
    .limit(10000);

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

// NEW FUNCTION: Search suppliers associated with a specific material category
export const searchSuppliersByCategory = async (categoryName: string, query: string): Promise<any[]> => {
  if (!categoryName) {
    return [];
  }

  let selectQuery = supabase
    .from('supplier_materials')
    .select(`
      suppliers!inner (
        id,
        name,
        rif,
        code,
        city,
        email,
        phone,
        phone_2,
        instagram,
        payment_terms,
        credit_days,
        status
      ),
      materials!inner (
        category
      ),
      specification
    `)
    .eq('materials.category', categoryName)
    .limit(10000);

  const { data: relations, error } = await selectQuery;

  if (error) {
    console.error('[searchSuppliersByCategory] Error:', error);
    return [];
  }

  // Deduplicate suppliers (since a supplier could be linked to multiple materials in the same category)
  const supplierMap = new Map<string, any>();
  
  relations.forEach(sm => {
    const sup = sm.suppliers as any;
    if (sup && !supplierMap.has(sup.id)) {
      supplierMap.set(sup.id, {
        ...sup,
        specification: sm.specification || '',
      });
    }
  });

  let suppliers = Array.from(supplierMap.values());

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
    .select('materials:material_id(id, name, code, category, unit, unit_id, is_exempt, search_aliases), specification')
    .eq('supplier_id', supplierId)
    .limit(10000);

  // Eliminamos el límite de 50 en la consulta a Supabase para obtener todos los asociados.
  const { data: relations, error } = await selectQuery;

  if (error) {
    console.error('[searchMaterialsBySupplier] Error:', error);
    return [];
  }

  const uniqueMaterialsMap = new Map<string, any>();
  
  relations.forEach(sm => {
    const mat = sm.materials as any;
    if (mat && !uniqueMaterialsMap.has(mat.id)) {
      uniqueMaterialsMap.set(mat.id, {
        ...mat,
        specification: sm.specification,
      });
    }
  });

  let materials = Array.from(uniqueMaterialsMap.values());

  // Client-side filtering based on query
  if (query.trim()) {
    const lowerCaseQuery = query.toLowerCase();
    materials = materials.filter(m =>
      m.name.toLowerCase().includes(lowerCaseQuery) ||
      (m.code && m.code.toLowerCase().includes(lowerCaseQuery)) ||
      (m.search_aliases && m.search_aliases.some((alias: string) => alias.toLowerCase().includes(lowerCaseQuery)))
    );
  }

  // Eliminamos el límite de 10 en el cliente. Devolvemos todos los resultados filtrados.
  return materials;
};

const toLocalDateString = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
        issue_date,
        delivery_date,
        status,
        currency,
        exchange_rate,
        supplier_id,
        suppliers (
          id,
          name,
          rif
        )
      ),
      materials (
        name,
        code,
        category,
        unit,
        search_aliases
      ),
      units_of_measure (
        name
      )
    `)
    .order('purchase_orders(issue_date)', { ascending: false });

  if (supplierId) {
    query = query.eq('purchase_orders.supplier_id', supplierId);
  }

  if (materialId) {
    query = query.eq('material_id', materialId);
  }

  if (startDate) {
    query = query.gte('purchase_orders.issue_date', toLocalDateString(startDate));
  }

  if (endDate) {
    query = query.lte('purchase_orders.issue_date', toLocalDateString(endDate));
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
  getPaginatedSuppliers,
  getAllMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  searchMaterials,
  searchMaterialsAndCategories,
  getRecentMaterials,
  getPaginatedMaterials,
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
  // getAllPurchaseOrders,
  // createPurchaseOrder,
  // updatePurchaseOrder,
  // deletePurchaseOrder,
  // getPurchaseOrderDetails,
  // archivePurchaseOrder,
  // unarchivePurchaseOrder,
  // updatePurchaseOrderStatus,
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
  getMaterialByName,
  getAllUnits,
  createUnit,
  deleteUnit,
  getAllMaterialCategories,
  createMaterialCategory,
  deleteMaterialCategory,
};