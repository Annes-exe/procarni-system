import { supabase } from '../client';

export type SearchResultType = 'purchase_order' | 'service_order' | 'quote_request' | 'supplier' | 'material';

export interface SearchResult {
    id: string;
    title: string;
    subtitle: string;
    type: SearchResultType;
    url: string;
}

export const searchService = {
    unifiedSearch: async (query: string): Promise<SearchResult[]> => {
        if (!query || query.length < 2) return [];

        const searchTerm = `%${query}%`;
        const results: SearchResult[] = [];

        try {
            // 1. Search Suppliers
            const { data: suppliers } = await supabase
                .from('suppliers')
                .select('id, name, rif')
                .or(`name.ilike.${searchTerm},rif.ilike.${searchTerm}`)
                .limit(5);

            const foundSupplierIds: string[] = [];
            if (suppliers) {
                suppliers.forEach(s => {
                    foundSupplierIds.push(s.id);
                    results.push({
                        id: s.id,
                        title: s.name,
                        subtitle: `Proveedor - RIF: ${s.rif}`,
                        type: 'supplier',
                        url: `/suppliers/${s.id}`
                    });
                });
            }

            // 2. Search Materials & Related Documents
            const { data: materials } = await supabase
                .from('materials')
                .select('id, name, code')
                .or(`name.ilike.${searchTerm},code.ilike.${searchTerm}`)
                .limit(5);

            if (materials && materials.length > 0) {
                const materialIds = materials.map(m => m.id);

                materials.forEach(m => {
                    results.push({
                        id: m.id,
                        title: m.name,
                        subtitle: `Material - Código: ${m.code || 'S/N'}`,
                        type: 'material',
                        url: `/material-management?search=${encodeURIComponent(m.name)}`
                    });
                });

                // --- CROSS-TABLE DOCUMENT SEARCH BY MATERIAL ---

                // A. Quote Request Items
                const { data: qrItems } = await supabase
                    .from('quote_request_items')
                    .select('request_id, quote_requests(id, suppliers(name))')
                    .in('material_id', materialIds)
                    .limit(2);

                if (qrItems) {
                    qrItems.forEach((item: any) => {
                        if (item.quote_requests && !results.some(r => r.id === item.quote_requests.id)) {
                            results.push({
                                id: item.quote_requests.id,
                                title: `SC vinculada a material`,
                                subtitle: `ID: ${item.quote_requests.id.substring(0, 8)} - Prov: ${item.quote_requests.suppliers?.name || 'Varios'}`,
                                type: 'quote_request',
                                url: `/quote-requests/${item.quote_requests.id}`
                            });
                        }
                    });
                }

                // B. Purchase Order Items
                const { data: poItems } = await supabase
                    .from('purchase_order_items')
                    .select('order_id, purchase_orders(id, sequence_number, suppliers(name))')
                    .in('material_id', materialIds)
                    .limit(2);

                if (poItems) {
                    poItems.forEach((item: any) => {
                        if (item.purchase_orders && !results.some(r => r.id === item.purchase_orders.id)) {
                            results.push({
                                id: item.purchase_orders.id,
                                title: `OC vinculada a material`,
                                subtitle: `OC #${item.purchase_orders.sequence_number} - Prov: ${item.purchase_orders.suppliers?.name || 'Varios'}`,
                                type: 'purchase_order',
                                url: `/purchase-orders/${item.purchase_orders.id}`
                            });
                        }
                    });
                }

                // C. Service Order Materials
                const { data: soMaterials } = await supabase
                    .from('service_order_materials')
                    .select('service_order_id, service_orders(id, sequence_number, equipment_name)')
                    .in('material_id', materialIds)
                    .limit(2);

                if (soMaterials) {
                    soMaterials.forEach((item: any) => {
                        if (item.service_orders && !results.some(r => r.id === item.service_orders.id)) {
                            results.push({
                                id: item.service_orders.id,
                                title: `OS vinculada a material`,
                                subtitle: `OS #${item.service_orders.sequence_number} - ${item.service_orders.equipment_name}`,
                                type: 'service_order',
                                url: `/service-orders/${item.service_orders.id}`
                            });
                        }
                    });
                }
            } else {
                // Documents containing the text in descriptions (only if query is descriptive)
                if (query.length > 4) {
                    // A. Quote Request Items by Description
                    const { data: qrItemsDesc } = await supabase
                        .from('quote_request_items')
                        .select('request_id, quote_requests(id, suppliers(name))')
                        .ilike('description', searchTerm)
                        .limit(2);

                    if (qrItemsDesc) {
                        qrItemsDesc.forEach((item: any) => {
                            if (item.quote_requests && !results.some(r => r.id === item.quote_requests.id)) {
                                results.push({
                                    id: item.quote_requests.id,
                                    title: `SC con ítem: "${query}"`,
                                    subtitle: `ID: ${item.quote_requests.id.substring(0, 8)} - Prov: ${item.quote_requests.suppliers?.name || 'Varios'}`,
                                    type: 'quote_request',
                                    url: `/quote-requests/${item.quote_requests.id}`
                                });
                            }
                        });
                    }

                    // B. Purchase Order Items by Description
                    const { data: poItemsDesc } = await supabase
                        .from('purchase_order_items')
                        .select('order_id, purchase_orders(id, sequence_number, suppliers(name))')
                        .ilike('description', searchTerm)
                        .limit(2);

                    if (poItemsDesc) {
                        poItemsDesc.forEach((item: any) => {
                            if (item.purchase_orders && !results.some(r => r.id === item.purchase_orders.id)) {
                                results.push({
                                    id: item.purchase_orders.id,
                                    title: `OC con ítem: "${query}"`,
                                    subtitle: `OC #${item.purchase_orders.sequence_number} - Prov: ${item.purchase_orders.suppliers?.name || 'Varios'}`,
                                    type: 'purchase_order',
                                    url: `/purchase-orders/${item.purchase_orders.id}`
                                });
                            }
                        });
                    }

                    // C. Service Order Items by Description
                    const { data: soItemsDesc } = await supabase
                        .from('service_order_items')
                        .select('order_id, service_orders(id, sequence_number, equipment_name)')
                        .ilike('description', searchTerm)
                        .limit(2);

                    if (soItemsDesc) {
                        soItemsDesc.forEach((item: any) => {
                            if (item.service_orders && !results.some(r => r.id === item.service_orders.id)) {
                                results.push({
                                    id: item.service_orders.id,
                                    title: `OS con servicio: "${query}"`,
                                    subtitle: `OS #${item.service_orders.sequence_number} - ${item.service_orders.equipment_name}`,
                                    type: 'service_order',
                                    url: `/service-orders/${item.service_orders.id}`
                                });
                            }
                        });
                    }
                }
            }

            // 3. Search Purchase Orders
            const isNumeric = !isNaN(Number(query)) && query.length > 0;
            let poQuery = supabase.from('purchase_orders').select('id, sequence_number');

            let hasPoFilter = false;
            let poSelect = 'id, sequence_number, suppliers(name)';

            if (isNumeric) {
                const numQuery = Number(query);
                if (query.length < 3) {
                    poQuery = poQuery.eq('sequence_number', numQuery);
                } else {
                    poQuery = poQuery.or(`sequence_number.eq.${numQuery}`);
                }
                hasPoFilter = true;
            } else if (query.length > 3) {
                // Search POs by supplier name with inner join to enforce filtering
                poSelect = 'id, sequence_number, suppliers!inner(name)';
                poQuery = poQuery.ilike('suppliers.name', searchTerm);
                hasPoFilter = true;
            }

            if (hasPoFilter) {
                const { data: pos } = await poQuery.select(poSelect).limit(5);
                if (pos) {
                    pos.forEach((po: any) => {
                        if (!results.some(r => r.id === po.id)) {
                            results.push({
                                id: po.id,
                                title: `Orden de Compra #${po.sequence_number}`,
                                subtitle: `Proveedor: ${po.suppliers?.name || 'Varios'}`,
                                type: 'purchase_order',
                                url: `/purchase-orders/${po.id}`
                            });
                        }
                    });
                }
            }

            // 4. Search Service Orders (by sequence or equipment)
            let soQuery = supabase.from('service_orders').select('id, sequence_number');

            let hasSoFilter = false;
            let soSelect = 'id, sequence_number, equipment_name, service_type, suppliers(name)';

            if (isNumeric) {
                const numQuery = Number(query);
                if (query.length < 3) {
                    soQuery = soQuery.eq('sequence_number', numQuery);
                } else {
                    soQuery = soQuery.or(`sequence_number.eq.${numQuery}`);
                }
                hasSoFilter = true;
            } else if (query.length > 3) {
                // For text search, use !inner to ensure supplier filter works parent-level if needed
                // Note: since we also search equipment/service type, if those match but supplier doesn't,
                // we might still want the parent. However, the user is seeing noise with suppliers.
                // Let's use !inner ONLY if we primarily expect a supplier match in this section.
                // Actually, let's just use !inner with the OR condition properly.
                
                soSelect = 'id, sequence_number, equipment_name, service_type, suppliers!inner(name)';
                soQuery = soQuery.or(`equipment_name.ilike.${searchTerm},service_type.ilike.${searchTerm},suppliers.name.ilike.${searchTerm}`);
                hasSoFilter = true;
            }

            if (hasSoFilter) {
                const { data: sos } = await soQuery.select(soSelect).limit(5);
                if (sos) {
                    sos.forEach((so: any) => {
                        if (!results.some(r => r.id === so.id)) {
                            results.push({
                                id: so.id,
                                title: `Orden de Servicio #${so.sequence_number}`,
                                subtitle: `${so.service_type} - ${so.equipment_name}`,
                                type: 'service_order',
                                url: `/service-orders/${so.id}`
                            });
                        }
                    });
                }
            }

            // 5. Search Quote Requests
            let qrQuery = supabase.from('quote_requests').select('id');

            let hasQrFilter = false;
            let qrSelect = 'id, suppliers(name)';

            if (query.length > 3) {
                // Search SCs by ID or supplier name
                qrSelect = 'id, suppliers!inner(name)';
                qrQuery = qrQuery.or(`id.ilike.${searchTerm},suppliers.name.ilike.${searchTerm}`);
                hasQrFilter = true;
            }

            if (hasQrFilter) {
                const { data: qrs } = await qrQuery.select(qrSelect).limit(5);
                if (qrs) {
                    qrs.forEach((qr: any) => {
                        if (!results.some(r => r.id === qr.id)) {
                            results.push({
                                id: qr.id,
                                title: `Solicitud de Cotización (SC)`,
                                subtitle: `ID: ${qr.id.substring(0, 8)} - Proveedor: ${qr.suppliers?.name || 'Varios'}`,
                                type: 'quote_request',
                                url: `/quote-requests/${qr.id}`
                            });
                        }
                    });
                }
            }

            return results;
        } catch (error) {
            console.error('Error in unifiedSearch:', error);
            return results;
        }
    }
};
