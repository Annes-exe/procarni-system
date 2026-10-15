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
        'Exclusivo 2.ª Quincena (Día 30)',
      ];
    }

    const unitLabel = it.productId === 'arroz' || it.productId === 'azucar' || it.productId === 'harina' ? 'kg' : (it.productId === 'papel' ? 'rollos' : (it.productId === 'jabon' ? 'barras' : 'und'));
    const bultosLabel = it.stockBultos > 0 ? `${it.stockBultos} bulto${it.stockBultos > 1 ? 's' : ''}` : '0 bultos';
    const looseLabel = it.stockLooseUnits > 0 ? `${it.stockLooseUnits} ${unitLabel}` : '0';
    const totalDeductedLabel = it.totalStockDeductedUnits > 0 ? `${it.totalStockDeductedUnits} ${unitLabel}` : '0';

    return [
      it.productName,
      `${it.unitsPerPackage} ${unitLabel}/bulto`,
      bultosLabel,
      looseLabel,
      totalDeductedLabel,
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['Insumo / Rubro', 'Presentación', 'Bultos Stock', 'Und / Kg Sueltos', 'Total Deducido']],
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
      0: { fontStyle: 'bold', cellWidth: 62 },
      1: { halign: 'center', cellWidth: 30 },
      2: { halign: 'center', cellWidth: 30 },
      3: { halign: 'center', cellWidth: 30 },
      4: { halign: 'center', fontStyle: 'bold', textColor: PROC_RED, cellWidth: 30 },
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
      if (rawRow && rawRow[4] === 'Exclusivo 2.ª Quincena (Día 30)') {
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
        ? `${pc.bultosToBuy} bultos${pc.manualAdjustment !== 0 ? ` (${pc.manualAdjustment > 0 ? `+${pc.manualAdjustment}` : pc.manualAdjustment} aj.)` : ''}`
        : '0 bultos';

      const maBultosText = ma
        ? `${ma.bultosToBuy} bultos${ma.manualAdjustment !== 0 ? ` (${ma.manualAdjustment > 0 ? `+${ma.manualAdjustment}` : ma.manualAdjustment} aj.)` : ''}`
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

  // Check if signatures fit on current page or require page break
  let sigY = finalY3 + 14;
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
