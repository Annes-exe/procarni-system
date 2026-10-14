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

  // Left: Company Brand & Identity
  doc.setTextColor(...PROC_RED);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('PRODUCTOS CÁRNICOS, C.A. & MONTANO ANTILIA, C.A.', margin, y + 4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...PROC_BLUE);
  doc.text('SISTEMA INTEGRAL DE COMPRAS E INVENTARIOS | PROCARNI SYSTEM', margin, y + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('R.I.F. J-30813958-0 / J-40019283-1  |  Dirección de Cadena de Suministro', margin, y + 13);

  // Right: Document Metadata
  const rightX = pageWidth - margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...PROC_RED);
  doc.text('RELACIÓN DE CÁLCULO DE DOTACIÓN', rightX, y + 4, { align: 'right' });

  const controlNumber = `DOT-${result.year}-${String(result.month).padStart(2, '0')}-${result.quincena === 'primera' ? 'Q1' : 'Q2'}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT_DARK);
  doc.text(`Nº Control: ${controlNumber}`, rightX, y + 9, { align: 'right' });

  const now = new Date();
  const printDateStr = format(now, 'dd/MM/yyyy HH:mm', { locale: es });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Emisión: ${format(now, 'dd/MM/yyyy', { locale: es })}  |  Impresión: ${printDateStr}`, rightX, y + 13, { align: 'right' });

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
  doc.text(`Total: ${result.totalEmployees} combos`, margin + colWidth + 3, y + 9.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`PC: ${result.pc.employees} combos  |  MA: ${result.ma.employees} combos`, margin + colWidth + 3, y + 13.5);

  // Cell 3: Resumen de Requerimiento de Compra
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('COMPRA GLOBAL CALCULADA:', margin + colWidth * 2 + 3, y + 4.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...PROC_RED);
  doc.text(`Total: ${result.totalGlobalBultos} bultos a comprar`, margin + colWidth * 2 + 3, y + 9.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`PC: ${result.pc.totalBultos} bultos  |  MA: ${result.ma.totalBultos} bultos`, margin + colWidth * 2 + 3, y + 13.5);

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
        '-',
        'Exclusivo 2.ª Quincena (Día 30)',
        '-',
      ];
    }

    const pcItem = result.pc.items.find((x) => x.productId === it.productId);
    const maItem = result.ma.items.find((x) => x.productId === it.productId);

    const bultosLabel = it.stockBultos > 0 ? `${it.stockBultos} bulto${it.stockBultos > 1 ? 's' : ''}` : '0 bultos';
    const looseUnitLabel = it.productId === 'azucar' ? 'kg' : 'und';
    const looseLabel = it.stockLooseUnits > 0 ? `${it.stockLooseUnits} ${looseUnitLabel}` : '0 sueltas';

    return [
      it.productName,
      `${it.unitsPerPackage} und/bulto`,
      bultosLabel,
      looseLabel,
      it.totalStockDeductedUnits > 0 ? `${it.totalStockDeductedUnits} und` : '0 und',
      pcItem?.stockDeductionDetail || '0',
      maItem?.stockDeductionDetail || '0',
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['Insumo', 'Presentación', 'Bultos Stock', 'Und/Kg Sueltos', 'Total Deducido', 'Deducción PC', 'Deducción MA']],
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
      0: { fontStyle: 'bold', cellWidth: 46 },
      1: { halign: 'center', cellWidth: 24 },
      2: { halign: 'center', cellWidth: 22 },
      3: { halign: 'center', cellWidth: 22 },
      4: { halign: 'center', fontStyle: 'bold', textColor: PROC_RED, cellWidth: 22 },
      5: { halign: 'center', cellWidth: 23 },
      6: { halign: 'center', cellWidth: 23 },
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
      // Style disabled period rows softly
      const rawRow = stockTableRows[data.row.index];
      if (rawRow && rawRow[5] === 'Exclusivo 2.ª Quincena (Día 30)') {
        data.cell.styles.textColor = TEXT_MUTED;
        data.cell.styles.fontStyle = 'italic';
      }
    },
  });

  const finalY1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || (y + 30);
  y = finalY1 + 5;

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
    if (it.hasDeficitAlert) {
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
      `${it.pcBultos}${pcAdjLabel}`,
      `${it.maBultos}${maAdjLabel}`,
      it.globalBultosToBuy.toString(),
      `${it.totalUnitsPurchased.toLocaleString('es-VE')} und`,
      bufferLabel,
    ];
  });

  // Totals Row
  const totalCombosAll = result.globalItems
    .filter((it) => it.includedInPeriod)
    .reduce((acc, it) => acc + it.totalComboUnits, 0);

  const totalFixedAll = result.globalItems
    .filter((it) => it.includedInPeriod)
    .reduce((acc, it) => acc + it.totalFixedUnits, 0);

  const totalStockAll = result.globalItems
    .filter((it) => it.includedInPeriod)
    .reduce((acc, it) => acc + it.totalStockDeductedUnits, 0);

  const totalUnitsAll = result.globalItems
    .filter((it) => it.includedInPeriod)
    .reduce((acc, it) => acc + it.totalUnitsPurchased, 0);

  purchaseRows.push([
    'TOTAL BULTOS A COMPRAR',
    '-',
    `${totalCombosAll.toLocaleString('es-VE')} und`,
    totalFixedAll > 0 ? `+${totalFixedAll} und (Fijo)` : '-',
    totalStockAll > 0 ? `-${totalStockAll} und` : '0',
    `${result.pc.totalBultos} bultos`,
    `${result.ma.totalBultos} bultos`,
    `${result.totalGlobalBultos} bultos`,
    `${totalUnitsAll.toLocaleString('es-VE')} und`,
    '-',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Insumo / Rubro', 'Presentación', 'Combos', 'Adiciones Fijas', 'Stock', 'Bultos PC', 'Bultos MA', 'Total Bultos', 'Total Und', 'Buffer']],
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
      0: { fontStyle: 'bold', cellWidth: 38 },
      1: { halign: 'center', cellWidth: 20 },
      2: { halign: 'center', cellWidth: 14 },
      3: { halign: 'center', cellWidth: 18 },
      4: { halign: 'center', cellWidth: 14 },
      5: { halign: 'center', fontStyle: 'bold', cellWidth: 16 },
      6: { halign: 'center', fontStyle: 'bold', cellWidth: 16 },
      7: { halign: 'center', fontStyle: 'bold', textColor: PROC_RED, cellWidth: 18 },
      8: { halign: 'center', cellWidth: 15 },
      9: { halign: 'center', cellWidth: 14 },
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
      if (data.row.index === purchaseRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [254, 242, 242]; // soft red highlight
        data.cell.styles.textColor = PROC_RED;
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
        ? `${pc.bultosToBuy} bultos${pc.manualAdjustment !== 0 ? ` (${pc.manualAdjustment > 0 ? `+${pc.manualAdjustment}` : pc.manualAdjustment} aj.)` : ''}`
        : '0 bultos';

      const maBultosText = ma
        ? `${ma.bultosToBuy} bultos${ma.manualAdjustment !== 0 ? ` (${ma.manualAdjustment > 0 ? `+${ma.manualAdjustment}` : ma.manualAdjustment} aj.)` : ''}`
        : '0 bultos';

      detailRows.push([
        it.productName,
        `PC (${result.pc.employees} combos)`,
        `${pc?.comboUnitsNeeded || 0} und`,
        pc?.fixedAdditionUnits ? `+${pc.fixedAdditionUnits} und (${pc.fixedAdditionLabel})` : '-',
        pc?.stockDeductionUnits ? `-${pc.stockDeductionUnits} und` : '0',
        `${pc?.netUnitsNeeded || 0} und (calc: ${pc?.calculatedBultos || 0} b)`,
        pcBultosText,
        pc?.optimizationNote || (pc?.surplusUnits ? `+${pc.surplusUnits} und buffer` : 'Exacto'),
      ]);

      detailRows.push([
        '',
        `MA (${result.ma.employees} combos)`,
        `${ma?.comboUnitsNeeded || 0} und`,
        ma?.fixedAdditionUnits ? `+${ma.fixedAdditionUnits} und (${ma.fixedAdditionLabel})` : '-',
        ma?.stockDeductionUnits ? `-${ma.stockDeductionUnits} und` : '0',
        `${ma?.netUnitsNeeded || 0} und (calc: ${ma?.calculatedBultos || 0} b)`,
        maBultosText,
        ma?.optimizationNote || (ma?.surplusUnits ? `+${ma.surplusUnits} und buffer` : 'Exacto'),
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

  // Check if signatures fit on current page or require page break
  let sigY = finalY3 + 12;
  if (sigY + 20 > pageHeight - 15) {
    doc.addPage();
    sigY = margin + 15;
  }

  // --- SIGNATURES SECTION ---
  const sigWidth = 50;
  const sig1X = margin + 4;
  const sig2X = margin + (contentWidth - sigWidth) / 2;
  const sig3X = pageWidth - margin - sigWidth - 4;

  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.4);
  doc.line(sig1X, sigY, sig1X + sigWidth, sigY);
  doc.line(sig2X, sigY, sig2X + sigWidth, sigY);
  doc.line(sig3X, sigY, sig3X + sigWidth, sigY);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PROC_BLUE);
  doc.text(emittedBy ? `Elaborado por: ${emittedBy}` : 'Elaborado por: Almacén y Dotación', sig1X + sigWidth / 2, sigY + 4, { align: 'center' });
  doc.text('Revisado por: Jefe de Almacén', sig2X + sigWidth / 2, sigY + 4, { align: 'center' });
  doc.text('Aprobado por: Gerencia de Compras', sig3X + sigWidth / 2, sigY + 4, { align: 'center' });

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_MUTED);
  doc.text('Firma y Sello', sig1X + sigWidth / 2, sigY + 8, { align: 'center' });
  doc.text('Firma y Sello', sig2X + sigWidth / 2, sigY + 8, { align: 'center' });
  doc.text('Firma y Sello', sig3X + sigWidth / 2, sigY + 8, { align: 'center' });

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
