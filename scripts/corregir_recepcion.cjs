#!/usr/bin/env node
/**
 * ==============================================================================
 * SCRIPT DE CORRECCIÓN / REINICIO DE RECEPCIÓN DE ÍTEMS EN ÓRDENES DE COMPRA (OC)
 * Procarni - Sistema de Compras
 * ==============================================================================
 * 
 * Permite:
 * 1. Consultar una OC por número (ej: 125 o OC-2026-03-125) o por UUID.
 * 2. Visualizar los ítems, cantidades solicitadas y recibidas.
 * 3. Reiniciar a 0 o modificar la cantidad recibida de uno o todos los ítems.
 * 4. Recalcular automáticamente el estado de recepción de la OC ('En tránsito', 'Parcial', 'Recibido', 'Ninguno').
 * 5. Opcionalmente limpiar registros erróneos en 'audit_logs' para que no afecten el Historial de Recepciones.
 * 6. Dejar constancia en 'audit_logs' de la corrección administrativa realizada.
 * 
 * Uso interactivo:
 *   node scripts/corregir_recepcion.cjs
 * 
 * Uso directo con parámetros (CLI):
 *   node scripts/corregir_recepcion.cjs --oc 125 --reset-all
 *   node scripts/corregir_recepcion.cjs --oc 125 --item 1 --qty 0
 *   node scripts/corregir_recepcion.cjs --oc 125 --item 1 --qty 50 --clean-audit
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 1. Cargar variables de entorno desde .env o scripts/.env
function loadEnv() {
  const possiblePaths = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '..', '.env'),
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'scripts', '.env'),
  ];

  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const match = trimmed.match(/^([^=]+)=(.*)$/);
          if (match) {
            const key = match[1].trim();
            let val = match[2].trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch (err) {
        // Ignorar error al leer ruta secundaria
      }
    }
  }
}

loadEnv();

// 2. Cargar cliente Supabase
let createClient;
try {
  createClient = require('@supabase/supabase-js').createClient;
} catch (e1) {
  try {
    createClient = require(path.join(__dirname, 'node_modules', '@supabase/supabase-js')).createClient;
  } catch (e2) {
    try {
      createClient = require(path.join(__dirname, '..', 'node_modules', '@supabase/supabase-js')).createClient;
    } catch (e3) {
      console.error('❌ Error: No se pudo cargar @supabase/supabase-js.');
      console.error('Asegúrate de ejecutar "npm install" o "pnpm install".');
      process.exit(1);
    }
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = 
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 
  process.env.VITE_SUPABASE_ANON_KEY || 
  process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Faltan credenciales de Supabase en el archivo .env');
  console.error('Se requiere VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY o VITE_SUPABASE_ANON_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 3. Helper de interfaz readline
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

// 4. Formateador de número de secuencia
function formatSequenceNumber(sequence, dateString) {
  if (!sequence) return 'N/A';
  const date = dateString ? new Date(dateString) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const seq = String(sequence).padStart(3, '0');
  return `OC-${year}-${month}-${seq}`;
}

// 5. Función para buscar la Orden de Compra
async function findPurchaseOrder(identifier) {
  const cleanId = String(identifier).trim();
  
  // Si parece un UUID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
  if (isUuid) {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('id, sequence_number, status, reception_status, supplier_id, created_at, issue_date, suppliers(name)')
      .eq('id', cleanId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  // Extraer número entero de strings tipo "OC-2026-03-012" o "12"
  const numericMatch = cleanId.match(/(\d+)$/);
  const seqNumber = numericMatch ? parseInt(numericMatch[1], 10) : parseInt(cleanId, 10);

  if (!isNaN(seqNumber)) {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('id, sequence_number, status, reception_status, supplier_id, created_at, issue_date, suppliers(name)')
      .eq('sequence_number', seqNumber)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  return null;
}

// 6. Obtener ítems de la OC
async function getOrderItems(orderId) {
  const { data, error } = await supabase
    .from('purchase_order_items')
    .select('id, order_id, material_name, quantity, unit, received_quantity, material_id')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

// 7. Mostrar tabla de ítems
function printItemsTable(po, items) {
  const orderCode = formatSequenceNumber(po.sequence_number, po.created_at);
  const supplierName = po.suppliers?.name || 'Sin proveedor';

  console.log('\n' + '='.repeat(85));
  console.log(`📦 ORDEN DE COMPRA: #${po.sequence_number} (${orderCode})`);
  console.log(`🏢 Proveedor: ${supplierName}`);
  console.log(`📊 Estado OC: ${po.status} | Estado Recepción Actual: ${po.reception_status || 'Ninguno'}`);
  console.log('='.repeat(85));
  console.log(
    '#'.padEnd(4) +
    'Material / Ítem'.padEnd(38) +
    'Solicitado'.padStart(12) +
    'Recibido'.padStart(12) +
    '  Estado Ítem'
  );
  console.log('-'.repeat(85));

  items.forEach((item, index) => {
    const num = `[${index + 1}]`.padEnd(4);
    const name = (item.material_name || 'Desconocido').substring(0, 36).padEnd(38);
    const requested = `${Number(item.quantity || 0).toFixed(2)} ${item.unit || ''}`.padStart(12);
    const received = `${Number(item.received_quantity || 0).toFixed(2)} ${item.unit || ''}`.padStart(12);

    let itemStatus = '🟡 PENDIENTE';
    const reqNum = Number(item.quantity || 0);
    const recNum = Number(item.received_quantity || 0);

    if (recNum >= reqNum && reqNum > 0) {
      itemStatus = '🟢 RECIBIDO';
    } else if (recNum > 0) {
      itemStatus = '🟠 PARCIAL';
    }

    console.log(`${num}${name}${requested}${received}  ${itemStatus}`);
  });
  console.log('='.repeat(85) + '\n');
}

// 8. Calcular el nuevo estado general de la OC
function calculateOrderReceptionStatus(items, previousStatus) {
  if (!items || items.length === 0) return 'Ninguno';

  let totalItems = items.length;
  let fullyReceivedCount = 0;
  let partialReceivedCount = 0;

  items.forEach((item) => {
    const qty = Number(item.quantity || 0);
    const recQty = Number(item.received_quantity || 0);

    if (recQty >= qty && qty > 0) {
      fullyReceivedCount++;
    } else if (recQty > 0) {
      partialReceivedCount++;
    }
  });

  if (fullyReceivedCount === totalItems) {
    return 'Recibido';
  } else if (partialReceivedCount > 0 || fullyReceivedCount > 0) {
    return 'Parcial';
  } else {
    // Si todos los ítems quedaron en 0
    if (previousStatus === 'En tránsito' || previousStatus === 'Parcial' || previousStatus === 'Recibido') {
      return 'En tránsito'; // Regresa a en tránsito para poder recibirlo luego
    }
    return 'Ninguno';
  }
}

// 9. Limpiar registros de auditoría erróneos (opcional para reportes limpios)
async function cleanErroneousAuditLogs(itemIds, poSequence) {
  try {
    const orderSeqStr = String(poSequence);
    
    // Buscar logs de recepción vinculados a estos items o a esta OC
    const { data: logs, error: fetchErr } = await supabase
      .from('audit_logs')
      .select('id, action, details')
      .eq('action', 'update_received_quantity');

    if (fetchErr || !logs) return 0;

    const idsToDelete = logs
      .filter((log) => {
        const d = log.details || {};
        const recId = d.record_id;
        const ordNum = String(d.order_number || '');
        const matchItem = itemIds.includes(recId);
        const matchOrder = ordNum.includes(orderSeqStr);
        return matchItem || matchOrder;
      })
      .map((l) => l.id);

    if (idsToDelete.length > 0) {
      const { error: delErr } = await supabase
        .from('audit_logs')
        .delete()
        .in('id', idsToDelete);

      if (delErr) {
        console.warn('⚠️ No se pudieron eliminar algunos registros de audit_logs:', delErr.message);
        return 0;
      }
      return idsToDelete.length;
    }
    return 0;
  } catch (err) {
    console.warn('⚠️ Error al limpiar audit_logs:', err.message);
    return 0;
  }
}

// 10. Registrar auditoría de corrección manual
async function logCorrectionAudit(po, item, oldQty, newQty, reason = 'Corrección manual por administración') {
  try {
    const orderCode = formatSequenceNumber(po.sequence_number, po.created_at);
    await supabase.from('audit_logs').insert({
      action: 'correction_received_quantity',
      user_email: 'sistema@procarni.com',
      timestamp: new Date().toISOString(),
      details: {
        table: 'purchase_order_items',
        record_id: item.id,
        order_id: po.id,
        order_number: orderCode,
        material_name: item.material_name,
        previous_received_quantity: oldQty,
        new_received_quantity: newQty,
        reason,
        description: `Corrección administrativa de recepción en ${orderCode}: Ítem '${item.material_name}' modificado de ${oldQty} a ${newQty}.`,
        user_name: 'Administrador (Script de Corrección)',
      },
    });
  } catch (err) {
    console.warn('⚠️ No se pudo registrar la entrada de auditoría:', err.message);
  }
}

// 11. Parsear argumentos CLI (si se pasan)
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--oc' && args[i + 1]) {
      options.oc = args[++i];
    } else if (arg === '--item' && args[i + 1]) {
      options.item = args[++i];
    } else if (arg === '--qty' && args[i + 1]) {
      options.qty = parseFloat(args[++i]);
    } else if (arg === '--reset-all') {
      options.resetAll = true;
    } else if (arg === '--clean-audit') {
      options.cleanAudit = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

// 12. Flujo principal
async function main() {
  console.log('\n============================================================');
  console.log('🛠️  PROCARNI - MODIFICADOR / REINICIADOR DE RECEPCIÓN DE OC');
  console.log('============================================================');

  const cliArgs = parseArgs();

  if (cliArgs.help) {
    console.log(`
Uso del script:
  node scripts/corregir_recepcion.cjs [opciones]

Opciones:
  --oc <número|UUID>     Número o UUID de la orden de compra (ej: 125, OC-2026-03-125)
  --item <# o ID>        Índice (1, 2, ...) o ID del ítem a modificar
  --qty <número>         Nueva cantidad recibida (ej: 0 para reiniciar)
  --reset-all            Reinicia TODOS los ítems de la OC a 0
  --clean-audit          Elimina los registros antiguos de recepción errónea en audit_logs
  --help, -h             Muestra esta ayuda

Si se ejecuta sin parámetros, el script entrará en MODO INTERACTIVO paso a paso.
    `);
    rl.close();
    process.exit(0);
  }

  try {
    // 1. Obtener OC
    let ocInput = cliArgs.oc;
    if (!ocInput) {
      ocInput = await askQuestion('📌 Ingrese el número de la OC (ej: 125 o OC-2026-03-125): ');
    }

    if (!ocInput || !ocInput.trim()) {
      console.log('❌ No se ingresó un identificador de OC.');
      rl.close();
      return;
    }

    const po = await findPurchaseOrder(ocInput);
    if (!po) {
      console.log(`❌ No se encontró ninguna Orden de Compra con el identificador "${ocInput}".`);
      rl.close();
      return;
    }

    // 2. Obtener ítems
    let items = await getOrderItems(po.id);
    if (items.length === 0) {
      console.log('⚠️ La Orden de Compra no contiene ningún ítem registrado.');
      rl.close();
      return;
    }

    printItemsTable(po, items);

    // Modo interactivo o CLI
    let shouldResetAll = cliArgs.resetAll || false;
    let selectedItem = null;
    let newQty = 0;

    if (!cliArgs.resetAll && cliArgs.item === undefined) {
      console.log('¿Qué acción desea realizar?');
      console.log('  [1] Reiniciar o modificar un ítem específico');
      console.log('  [2] Reiniciar TODOS los ítems de esta OC a 0 (reinicio completo)');
      console.log('  [3] Solo actualizar/recalcular el estado de la OC');
      console.log('  [4] Salir sin hacer cambios');

      const action = await askQuestion('\n👉 Seleccione una opción [1-4]: ');

      if (action.trim() === '4' || !action.trim()) {
        console.log('Operación cancelada. No se aplicó ningún cambio.');
        rl.close();
        return;
      }

      if (action.trim() === '2') {
        shouldResetAll = true;
      } else if (action.trim() === '3') {
        // Solo recalcular estado
        const newStatus = calculateOrderReceptionStatus(items, po.reception_status);
        await supabase.from('purchase_orders').update({ reception_status: newStatus }).eq('id', po.id);
        console.log(`✅ Estado de recepción de la OC actualizado a: "${newStatus}".`);
        rl.close();
        return;
      } else if (action.trim() === '1') {
        const itemIdxStr = await askQuestion(`\n👉 Ingrese el número del ítem a modificar [1-${items.length}]: `);
        const itemIdx = parseInt(itemIdxStr.trim(), 10) - 1;

        if (isNaN(itemIdx) || itemIdx < 0 || itemIdx >= items.length) {
          console.log('❌ Número de ítem inválido.');
          rl.close();
          return;
        }

        selectedItem = items[itemIdx];
        const qtyStr = await askQuestion(`👉 Ingrese la nueva cantidad recibida para "${selectedItem.material_name}" (solicitado: ${selectedItem.quantity}, actual recibido: ${selectedItem.received_quantity || 0}) [0 para reiniciar]: `);
        
        newQty = parseFloat(qtyStr.trim() || '0');
        if (isNaN(newQty) || newQty < 0) {
          console.log('❌ La cantidad debe ser un número mayor o igual a 0.');
          rl.close();
          return;
        }

        if (newQty > Number(selectedItem.quantity)) {
          console.log(`⚠️ Advertencia: La cantidad a recibir (${newQty}) supera la cantidad solicitada (${selectedItem.quantity}).`);
          const confirm = await askQuestion('¿Desea continuar de todas formas? [s/N]: ');
          if (confirm.toLowerCase().trim() !== 's') {
            console.log('Operación cancelada.');
            rl.close();
            return;
          }
        }
      }
    } else if (cliArgs.item !== undefined) {
      // CLI con item específico
      const itemIdx = parseInt(cliArgs.item, 10) - 1;
      if (!isNaN(itemIdx) && itemIdx >= 0 && itemIdx < items.length) {
        selectedItem = items[itemIdx];
      } else {
        selectedItem = items.find((i) => i.id === cliArgs.item);
      }

      if (!selectedItem) {
        console.log(`❌ No se encontró el ítem especificado por "${cliArgs.item}".`);
        rl.close();
        return;
      }

      newQty = cliArgs.qty !== undefined ? cliArgs.qty : 0;
    }

    // Confirmación de limpieza de logs de auditoría erróneos
    let cleanAuditLogs = cliArgs.cleanAudit || false;
    if (!cliArgs.cleanAudit) {
      const askClean = await askQuestion('\n🧹 ¿Desea eliminar los registros erróneos de recepción de audit_logs para que NO aparezcan en el Historial de Recepciones? [S/n]: ');
      cleanAuditLogs = askClean.toLowerCase().trim() !== 'n';
    }

    // EJECUCIÓN
    console.log('\n⏳ Aplicando correcciones en la base de datos...');

    if (shouldResetAll) {
      // Reiniciar todos
      for (const it of items) {
        const oldVal = Number(it.received_quantity || 0);
        await supabase
          .from('purchase_order_items')
          .update({ received_quantity: 0 })
          .eq('id', it.id);

        if (oldVal > 0) {
          await logCorrectionAudit(po, it, oldVal, 0, 'Reinicio total de ítems de la OC');
        }
      }

      // Actualizar estado general de la OC
      // Al reiniciar todos, si estaba en tránsito o parcial, lo dejamos 'En tránsito' para que pueda recibirse bien
      const targetStatus = 'En tránsito';
      await supabase
        .from('purchase_orders')
        .update({ reception_status: targetStatus })
        .eq('id', po.id);

      if (cleanAuditLogs) {
        const cleanedCount = await cleanErroneousAuditLogs(items.map((i) => i.id), po.sequence_number);
        console.log(`🧹 Se limpiaron ${cleanedCount} registros antiguos de recepción en audit_logs.`);
      }

      console.log(`\n✅ ¡LISTO! Todos los ítems de la OC #${po.sequence_number} fueron reiniciados a 0.`);
      console.log(`📊 El estado de recepción de la OC se estableció en: "${targetStatus}".`);
    } else if (selectedItem) {
      // Modificar item individual
      const oldVal = Number(selectedItem.received_quantity || 0);
      
      const { error: updErr } = await supabase
        .from('purchase_order_items')
        .update({ received_quantity: newQty })
        .eq('id', selectedItem.id);

      if (updErr) throw updErr;

      // Registrar auditoría de corrección
      await logCorrectionAudit(po, selectedItem, oldVal, newQty);

      // Actualizar array local para recalcular el estado de la OC
      selectedItem.received_quantity = newQty;
      const newOrderStatus = calculateOrderReceptionStatus(items, po.reception_status);

      await supabase
        .from('purchase_orders')
        .update({ reception_status: newOrderStatus })
        .eq('id', po.id);

      if (cleanAuditLogs && (oldVal > newQty || newQty === 0)) {
        const cleanedCount = await cleanErroneousAuditLogs([selectedItem.id], po.sequence_number);
        console.log(`🧹 Se limpiaron ${cleanedCount} registros erróneos en audit_logs.`);
      }

      console.log(`\n✅ ¡LISTO! Ítem "${selectedItem.material_name}" actualizado:`);
      console.log(`   - Cantidad anterior: ${oldVal}`);
      console.log(`   - Nueva cantidad:   ${newQty}`);
      console.log(`📊 Nuevo estado general de recepción de la OC: "${newOrderStatus}".`);
    }

    // Mostrar tabla final
    const updatedItems = await getOrderItems(po.id);
    const updatedPo = await findPurchaseOrder(po.id);
    printItemsTable(updatedPo, updatedItems);

  } catch (err) {
    console.error('\n❌ Ocurrió un error inesperado:', err.message || err);
  } finally {
    rl.close();
  }
}

main();
