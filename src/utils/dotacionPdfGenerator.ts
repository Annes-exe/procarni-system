import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DotacionCalculationResult } from '@/types/dotacion';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export function generateDotacionPDF(result: DotacionCalculationResult, emittedBy?: string): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const PROC_RED: [number, number, number] = [136, 10, 10]; // #880a0a
  const PROC_BLUE: [number, number, number] = [27, 41, 74]; // #1B294A
  const TEXT_DARK: [number, number, number] = [15, 23, 42]; // #0f172a
  const TEXT_MUTED: [number, number, number] = [100, 116, 139]; // #64748b
  const LIGHT_ROW: [number, number, number] = [248, 250, 252];
  const BORDER_COLOR: [number, number, number] = [226, 232, 240];

  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;

  // --- HEADER SECTION (Procarni System Standard) ---
  let y = margin;

  // Left: Brand Identifier (as shown in the sample)
  doc.setTextColor(...PROC_BLUE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('PROCARNI', margin, y + 6);

  doc.setTextColor(...PROC_RED);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('SYSTEM', margin, y + 10.5);

  // Right: Document Title & Metadata
  const rightX = pageWidth - margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...PROC_BLUE);
  doc.text('Reporte de Cálculo de Dotación', rightX, y + 4, { align: 'right' });

  const now = new Date();
  const printDateStr = format(now, 'dd/MM/yyyy', { locale: es });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Periodo: ${result.periodLabel}`, rightX, y + 8.5, { align: 'right' });
  doc.text(`Fecha Emisión: ${printDateStr}`, rightX, y + 12.5, { align: 'right' });

  y += 16;

  // Red Accent Line (2pt thick)
  doc.setFillColor(...PROC_RED);
  doc.rect(margin, y, contentWidth, 0.8, 'F');

  y += 4;

  // --- METADATA BOX (3 Dynamic Indicator Cells) ---
  const boxHeight = 16;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, boxHeight, 2, 2, 'FD');

  const colWidth = contentWidth / 3;

  // Cell 1: Período de Dotación
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('PERÍODO DE DOTACIÓN:', margin + 3, y + 4.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...PROC_BLUE);
  doc.text(result.periodLabel.toUpperCase(), margin + 3, y + 9.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(
    result.quincena === 'primera' ? '1.ª Quincena (Día 15 - Sin Jabón)' : '2.ª Quincena (Día 30 - Con Jabón)',
    margin + 3,
    y + 13.5
  );

  // Cell 2: Nómina Colaboradores (Variable per company)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('NÓMINA DE COLABORADORES:', margin + colWidth + 3, y + 4.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT_DARK);
  const contingencyNotice = result.totalContingencyCombos ? ` (+${result.totalContingencyCombos} cont.)` : '';
  doc.text(`Total: ${result.totalEmployees} combos${contingencyNotice}`, margin + colWidth + 3, y + 9.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_MUTED);
  const pcSub = result.contingencyCombosPC ? `PC: ${result.pc.employees} (+${result.contingencyCombosPC})` : `PC: ${result.pc.employees}`;
  const maSub = result.contingencyCombosMA ? `MA: ${result.ma.employees} (+${result.contingencyCombosMA})` : `MA: ${result.ma.employees}`;
  doc.text(`${pcSub}  |  ${maSub} combos`, margin + colWidth + 3, y + 13.5);

  // Cell 3: Resumen de Requerimiento de Compra
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('COMPRA GLOBAL CALCULADA:', margin + colWidth * 2 + 3, y + 4.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...PROC_RED);
  doc.text(`Total: ${result.totalGlobalBultos} bultos${result.totalGlobalLooseUnits > 0 ? ` + ${result.totalGlobalLooseUnits} und` : ""} a comprar`, margin + colWidth * 2 + 3, y + 9.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`PC: ${result.pc.totalBultos} b${result.pc.totalLooseUnits > 0 ? ` + ${result.pc.totalLooseUnits}u` : ""}  |  MA: ${result.ma.totalBultos} b${result.ma.totalLooseUnits > 0 ? ` + ${result.ma.totalLooseUnits}u` : ""}`, margin + colWidth * 2 + 3, y + 13.5);

  y += boxHeight + 5;

  // --- TABLA 1: INVENTARIO CONSOLIDADO EN ALMACÉN ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...PROC_BLUE);
  doc.text('1. EXISTENCIAS CONSOLIDADAS EN ALMACÉN DE DOTACIÓN (DEDUCCIÓN DE STOCK)', margin, y);

  y += 2;

  const stockTableRows = result.globalItems.map((it) => {
    if (!it.includedInPeriod) {
      return [
        it.productName,
        `${it.unitsPerPackage} und/bulto`,
        '-',
        '-',
        'Exclusivo 2.ª Quincena (Día 30)',
      ];
    }

    const unitLabel = it.productId === 'arroz' || it.productId === 'azucar' || it.productId === 'harina' ? 'kg' : (it.productId === 'papel' ? 'rollos' : (it.productId === 'jabon' ? 'barras' : 'und'));
    
    // Stock Físico Contado
    const physBultos = typeof it.physicalStockBultos === 'number' ? it.physicalStockBultos : it.stockBultos;
    const physLoose = typeof it.physicalStockLooseUnits === 'number' ? it.physicalStockLooseUnits : it.stockLooseUnits;
    const physTotal = typeof it.physicalStockTotalUnits === 'number' ? it.physicalStockTotalUnits : (physBultos * it.unitsPerPackage + physLoose);
    const physLabel = physBultos > 0
      ? (physLoose > 0 ? `${physBultos} b + ${physLoose} ${unitLabel}` : `${physBultos} b (${physTotal} ${unitLabel})`)
      : (physLoose > 0 ? `${physLoose} ${unitLabel}` : '0');

    // Consumo Previo
    let transitLabel = '-';
    if (it.transitionConsumptionUnits && it.transitionConsumptionUnits > 0) {
      const days = result.transitionProjection?.daysRemaining || 0;
      let rateText = '';
      if (it.productId === 'arroz') {
        rateText = `@ ${result.transitionProjection?.arrozDailyRateKg || 18}k/d`;
      } else if (it.productId === 'papel') {
        rateText = `@ ${result.transitionProjection?.papelDailyRateRollos || 9.6}u/d`;
      } else if (it.productId === 'azucar') {
        rateText = `@ ${result.transitionProjection?.azucarDailyRateKg || 2}k/d`;
      }
      transitLabel = `-${it.transitionConsumptionUnits} ${unitLabel} (${days}d ${rateText})`;
    }

    // Stock Efectivo al inicio de Quincena
    let effectiveLabel = '0';
    if (it.totalStockDeductedUnits > 0) {
      if (it.stockBultos > 0 && it.stockLooseUnits > 0) {
        effectiveLabel = `${it.stockBultos} b + ${it.stockLooseUnits} ${unitLabel} (${it.totalStockDeductedUnits} ${unitLabel})`;
      } else if (it.stockBultos > 0) {
        effectiveLabel = `${it.stockBultos} b (${it.totalStockDeductedUnits} ${unitLabel})`;
      } else {
        effectiveLabel = `${it.totalStockDeductedUnits} ${unitLabel}`;
      }
    }

    return [
      it.productName,
      `${it.unitsPerPackage} ${unitLabel}/bulto`,
      physLabel,
      transitLabel,
      effectiveLabel,
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['Insumo / Rubro', 'Presentación', 'Stock Físico', 'Consumo Previo', 'Stock Efectivo Quincena']],
    body: stockTableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [71, 85, 105],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 54 },
      1: { halign: 'center', cellWidth: 26 },
      2: { halign: 'center', cellWidth: 36 },
      3: { halign: 'center', textColor: [180, 83, 9], cellWidth: 38 },
      4: { halign: 'center', fontStyle: 'bold', textColor: PROC_RED, cellWidth: 36 },
    },
    styles: {
      fontSize: 7.2,
      cellPadding: 1.8,
      textColor: TEXT_DARK,
    },
    alternateRowStyles: {
      fillColor: LIGHT_ROW,
    },
    didParseCell: (data) => {
      // Style disabled period rows softly
      const rawRow = stockTableRows[data.row.index];
      if (rawRow && rawRow[4] === 'Exclusivo 2.ª Quincena (Día 30)') {
        data.cell.styles.textColor = TEXT_MUTED;
        data.cell.styles.fontStyle = 'italic';
      }
    },
  });

  const finalY1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || (y + 30);
  y = finalY1 + 3;

  // Nota de transición si aplica
  if (result.transitionProjection && result.transitionProjection.daysRemaining > 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(
      `* Transición: Conteo al ${result.transitionProjection.calculationDate}. Restan ${result.transitionProjection.daysRemaining} día(s) para la quincena (${result.transitionProjection.targetStartDate}). Se descuenta consumo diario operativo (Arroz Comedor: -${result.transitionProjection.arrozIntermediateConsumptionKg}kg | Papel Baños: -${result.transitionProjection.papelIntermediateConsumptionRollos}u | Azúcar Cafetería: -${result.transitionProjection.azucarIntermediateConsumptionKg}kg).`,
      margin,
      y
    );
    y += 3.5;

    const deficits: string[] = [];
    if (result.transitionProjection.isRiceDeficit) {
      deficits.push(`Arroz (-${result.transitionProjection.riceDeficitKg}kg)`);
    }
    if (result.transitionProjection.isPapelDeficit) {
      deficits.push(`Papel (-${result.transitionProjection.papelDeficitRollos}u)`);
    }
    if (result.transitionProjection.isAzucarDeficit) {
      deficits.push(`Azúcar (-${result.transitionProjection.azucarDeficitKg}kg)`);
    }

    if (deficits.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(...PROC_RED);
      doc.text(
        `* ALERTA DE DÉFICIT PREVIO EN ALMACÉN: El stock físico no cubre los ${result.transitionProjection.daysRemaining} días previos en: ${deficits.join(', ')}.`,
        margin,
        y
      );
      y += 3.5;
    }
  }

  y += 2;

  // --- TABLA 2: PEDIDO DE COMPRA DE BULTOS (REQUERIMIENTO CONSOLIDADO) ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...PROC_RED);
  doc.text('2. REQUERIMIENTO CONSOLIDADO DE COMPRA (BULTOS A ORDENAR)', margin, y);

  y += 2;

  const purchaseRows = result.globalItems.map((it) => {
    if (!it.includedInPeriod) {
      return [
        it.productName,
        `${it.unitsPerPackage} und/bulto`,
        '-',
        '-',
        '-',
        '-',
        '-',
        '-',
        '-',
        'Exclusivo 2.ª Quincena',
      ];
    }

    const pcAdjLabel = it.pcAdjustment !== 0 ? ` (${it.pcAdjustment > 0 ? `+${it.pcAdjustment}` : it.pcAdjustment} aj)` : '';
    const maAdjLabel = it.maAdjustment !== 0 ? ` (${it.maAdjustment > 0 ? `+${it.maAdjustment}` : it.maAdjustment} aj)` : '';

    let bufferLabel = it.netSurplusUnits >= 0 ? `+${it.netSurplusUnits} und` : `${it.netSurplusUnits} und`;
    if (it.netSurplusUnits === 0) {
      bufferLabel = '0 und (Exacto)';
    } else if (it.productId === 'arroz' && it.netSurplusUnits > 0) {
      bufferLabel = `+${it.netSurplusUnits} kg (Comedor)`;
    } else if (it.productId === 'papel' && it.netSurplusUnits > 0) {
      bufferLabel = `+${it.netSurplusUnits} rollos (Planta)`;
    } else if (it.productId === 'azucar' && it.netSurplusUnits > 0) {
      bufferLabel = `+${it.netSurplusUnits} kg (Cafetería)`;
    } else if (it.isWithinTolerance && it.netSurplusUnits > 0) {
      bufferLabel = `+${it.netSurplusUnits} und (≤${it.maxSurplusAllowed} tol.)`;
    } else if (it.hasDeficitAlert) {
      bufferLabel = `${it.netSurplusUnits} und (Faltante)`;
    } else if (it.hasSurplusOverlap) {
      bufferLabel = `+${it.netSurplusUnits} und (Excedente)`;
    }

    const fixedCell = it.totalFixedUnits > 0
      ? `+${it.totalFixedUnits} und (${it.totalFixedLabel})`
      : '-';

    return [
      it.productName,
      `${it.unitsPerPackage} und/bulto`,
      `${it.totalComboUnits} und`,
      fixedCell,
      it.totalStockDeductedUnits > 0 ? `-${it.totalStockDeductedUnits} und` : '0',
      `${it.pcBultos}${pcAdjLabel}${it.pcLooseUnitsToBuy > 0 ? `\n(+${it.pcLooseUnitsToBuy} u)` : ''}`,
      `${it.maBultos}${maAdjLabel}${it.maLooseUnitsToBuy > 0 ? `\n(+${it.maLooseUnitsToBuy} u)` : ''}`,
      (it.globalLooseUnitsToBuy > 0
        ? `${it.globalBultosToBuy} b + ${it.globalLooseUnitsToBuy} u`
        : it.globalBultosToBuy.toString()),
      `${it.totalUnitsPurchased.toLocaleString('es-VE')} und`,
      bufferLabel,
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['Insumo / Rubro', 'Presentación', 'Combos', 'Adiciones Fijas', 'Stock', 'Bultos PC', 'Bultos MA', 'Total Compra', 'Total Und', 'Buffer']],
    body: purchaseRows,
    theme: 'grid',
    headStyles: {
      fillColor: PROC_BLUE,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 34 },
      1: { halign: 'center', cellWidth: 18 },
      2: { halign: 'center', cellWidth: 14 },
      3: { halign: 'center', cellWidth: 18 },
      4: { halign: 'center', cellWidth: 14 },
      5: { halign: 'center', fontStyle: 'bold', cellWidth: 17 },
      6: { halign: 'center', fontStyle: 'bold', cellWidth: 17 },
      7: { halign: 'center', fontStyle: 'bold', textColor: PROC_RED, cellWidth: 20 },
      8: { halign: 'center', cellWidth: 14 },
      9: { halign: 'center', cellWidth: 12 },
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 1.8,
      textColor: TEXT_DARK,
    },
    alternateRowStyles: {
      fillColor: LIGHT_ROW,
    },
    didParseCell: (data) => {
      // Resaltar en rojo la columna 'Total Bultos' (índice 7)
      if (data.column.index === 7) {
        if (data.section === 'head') {
          data.cell.styles.fillColor = PROC_RED;
          data.cell.styles.textColor = [255, 255, 255];
        } else if (data.section === 'body') {
          data.cell.styles.fillColor = [254, 242, 242]; // fondo suave rojizo
          data.cell.styles.textColor = PROC_RED; // texto rojo negrita
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  const finalY2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || (y + 45);
  y = finalY2 + 5;

  // --- TABLA 3: DESGLOSE OPERATIVO POR EMPRESA ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...PROC_BLUE);
  doc.text('3. DESGLOSE OPERATIVO DETALLADO POR EMPRESA', margin, y);

  y += 2;

  const detailRows: (string | number)[][] = [];

  result.globalItems
    .filter((it) => it.includedInPeriod)
    .forEach((it) => {
      const pc = result.pc.items.find((x) => x.productId === it.productId);
      const ma = result.ma.items.find((x) => x.productId === it.productId);

      const pcBultosText = pc
        ? `${pc.bultosToBuy} bultos${pc.looseUnitsToBuy > 0 ? ` + ${pc.looseUnitsToBuy} u` : ''}${pc.manualAdjustment !== 0 ? ` (${pc.manualAdjustment > 0 ? `+${pc.manualAdjustment}` : pc.manualAdjustment} aj.)` : ''}`
        : '0 bultos';

      const maBultosText = ma
        ? `${ma.bultosToBuy} bultos${ma.looseUnitsToBuy > 0 ? ` + ${ma.looseUnitsToBuy} u` : ''}${ma.manualAdjustment !== 0 ? ` (${ma.manualAdjustment > 0 ? `+${ma.manualAdjustment}` : ma.manualAdjustment} aj.)` : ''}`
        : '0 bultos';
      const formatBufferText = (itemCalc: typeof pc) => {
        if (!itemCalc) return '0 und';
        if (itemCalc.optimizationNote) return itemCalc.optimizationNote;
        if (itemCalc.surplusUnits === 0) return 'Exacto';
        if (itemCalc.surplusUnits > 0) return `+${itemCalc.surplusUnits} und buffer`;
        return `${itemCalc.surplusUnits} und (compensado)`;
      };

      detailRows.push([
        it.productName,
        `PC (${result.pc.employees} combos)`,
        `${pc?.comboUnitsNeeded || 0} und`,
        pc?.fixedAdditionUnits ? `+${pc.fixedAdditionUnits} und (${pc.fixedAdditionLabel})` : '-',
        pc?.stockDeductionUnits ? `-${pc.stockDeductionUnits} und` : '0',
        `${pc?.netUnitsNeeded || 0} und (calc: ${pc?.calculatedBultos || 0} b)`,
        pcBultosText,
        formatBufferText(pc),
      ]);

      detailRows.push([
        '',
        `MA (${result.ma.employees} combos)`,
        `${ma?.comboUnitsNeeded || 0} und`,
        ma?.fixedAdditionUnits ? `+${ma.fixedAdditionUnits} und (${ma.fixedAdditionLabel})` : '-',
        ma?.stockDeductionUnits ? `-${ma.stockDeductionUnits} und` : '0',
        `${ma?.netUnitsNeeded || 0} und (calc: ${ma?.calculatedBultos || 0} b)`,
        maBultosText,
        formatBufferText(ma),
      ]);
    });

  autoTable(doc, {
    startY: y,
    head: [['Insumo', 'Empresa', 'Combos', 'Adición Fija', 'Almacén', 'Necesidad Neta', 'Bultos Compra', 'Observación / Ajuste']],
    body: detailRows,
    theme: 'grid',
    headStyles: {
      fillColor: [100, 116, 139],
      textColor: [255, 255, 255],
      fontSize: 7.5,
      halign: 'center',
    },
    styles: {
      fontSize: 7,
      cellPadding: 1.6,
      textColor: TEXT_DARK,
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
  });

  const finalY3 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || 240;
  y = finalY3 + 6;

  // --- TABLA 4: DESTINOS DE INSUMOS (ARMADO DE COMBOS Y USOS OPERATIVOS) ---
  const nonComboItems = result.nonComboDestinations || [];
  let finalY4 = finalY3;

  if (nonComboItems.length > 0) {
    if (y + 40 > pageHeight - 35) {
      doc.addPage();
      y = margin + 5;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...PROC_BLUE);
    doc.text('4. DESTINO DETALLADO DE INSUMOS (ARMADO DE COMBOS Y CONSUMOS OPERATIVOS)', margin, y);

    y += 2;

    const nonComboRows = nonComboItems.map((item) => [
      item.destination,
      item.productName,
      `${item.quantityUnits} ${item.unitLabel}`,
      `${item.equivalentBultos} bto`,
      item.observations,
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Destino / Área', 'Insumo Requerido', 'Total Cantidad', 'Equivalente en Bultos', 'Detalle / Criterio Operativo']],
      body: nonComboRows,
      theme: 'grid',
      headStyles: {
        fillColor: PROC_BLUE,
        textColor: [255, 255, 255],
        fontSize: 7.5,
        halign: 'center',
      },
      styles: {
        fontSize: 7,
        cellPadding: 1.6,
        textColor: TEXT_DARK,
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 38 },
        1: { cellWidth: 32 },
        2: { halign: 'center', fontStyle: 'bold', cellWidth: 26 },
        3: { halign: 'center', fontStyle: 'bold', cellWidth: 26 },
        4: { fontSize: 6.8, cellWidth: 60 },
      },
      alternateRowStyles: {
        fillColor: [255, 255, 255],
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const dest = String(data.row.raw[0] || '');
          if (dest.includes('Armado de Combos')) {
            data.cell.styles.fillColor = [240, 246, 255]; // Azul sutil para combos
          } else if (dest.includes('Colchón de Contingencia')) {
            data.cell.styles.fillColor = [250, 245, 255]; // Púrpura sutil para contingencia
          }
        }
      },
    });

    finalY4 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || (y + 30);
  }

  // Check if signatures fit on current page or require page break
  let sigY = finalY4 + 12;
  if (sigY + 22 > pageHeight - 15) {
    doc.addPage();
    sigY = margin + 15;
  }

  // --- SIGNATURES SECTION (2 Firmas centradas y balanceadas) ---
  const sigWidth = 65;
  const sigGap = contentWidth - sigWidth * 2;
  const sig1X = margin + sigGap / 3;
  const sig2X = margin + sigWidth + (sigGap / 3) * 2;

  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.4);
  doc.line(sig1X, sigY, sig1X + sigWidth, sigY);
  doc.line(sig2X, sigY, sig2X + sigWidth, sigY);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PROC_BLUE);
  doc.text(emittedBy ? `Elaborado por: ${emittedBy}` : 'Elaborado por', sig1X + sigWidth / 2, sigY + 4.5, { align: 'center' });
  doc.text('Aprobado por Gerencia', sig2X + sigWidth / 2, sigY + 4.5, { align: 'center' });

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_MUTED);
  doc.text('Firma', sig1X + sigWidth / 2, sigY + 8.5, { align: 'center' });
  doc.text('Firma', sig2X + sigWidth / 2, sigY + 8.5, { align: 'center' });

  // --- MULTI-PAGE RUNNING FOOTER ---
  const pageCount = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text(
      `Sistema Integral de Compras e Inventarios Procarni  |  Documento oficial generado el ${printDateStr}  |  Página ${i} de ${pageCount}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
    );
  }

  // Download PDF
  const sanitizedFilename = `Relacion_Dotacion_${result.year}_${String(result.month).padStart(2, '0')}_${result.quincena === 'primera' ? 'Q1' : 'Q2'}.pdf`;
  doc.save(sanitizedFilename);
}
