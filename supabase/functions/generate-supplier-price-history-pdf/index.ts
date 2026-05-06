import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { PDFDocument, rgb, StandardFonts, PDFPage, PageSizes } from 'https://esm.sh/pdf-lib@1.17.1'; // Import PageSizes

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Expose-Headers': 'Content-Disposition',
};

function sanitizeFilename(filename: string): string {
  return filename.replace(/[/\\?%*:|"<>]/g, '-');
}

// --- CONSTANTS ---
const PROC_RED = rgb(0.533, 0.039, 0.039); // #880a0a
const LIGHT_GRAY = rgb(0.9, 0.9, 0.9);
const DARK_GRAY = rgb(0.5, 0.5, 0.5);
const MARGIN = 30;
const FONT_SIZE = 9;
const LINE_HEIGHT = FONT_SIZE * 1.2;
const TIGHT_LINE_SPACING = FONT_SIZE * 1.1;
const MIN_ROW_HEIGHT = LINE_HEIGHT * 1.5;

// --- UTILITY FUNCTIONS ---

const formatSequenceNumber = (sequence?: number, dateString?: string): string => {
  if (!sequence) return 'N/A';

  const date = dateString ? new Date(dateString) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const seq = String(sequence).padStart(3, '0');

  return `OC-${year}-${month}-${seq}`;
};

const convertPriceToUSD = (entry: any): number | null => {
  const price = entry.unit_price;
  const currency = entry.currency;
  const rate = entry.exchange_rate;

  if (currency === 'USD') {
    return price;
  }

  if (currency === 'VES') {
    if (rate && rate > 0) {
      return price / rate;
    }
    return null;
  }

  return null;
};

function wrapText(text: string, maxCharsPerLine: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).length > maxCharsPerLine) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine += (currentLine === '' ? '' : ' ') + word;
    }
  }
  if (currentLine !== '') {
    lines.push(currentLine.trim());
  }
  return lines;
}

// --- MAIN SERVE HANDLER ---

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const { supplierId, supplierName } = await req.json();
    console.log(`[generate-supplier-price-history-pdf] Generating PDF for supplier ID: ${supplierId} by user: ${user.email}`);

    if (!supplierId) {
      return new Response(JSON.stringify({ error: 'Supplier ID es requerido.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch supplier details
    const { data: supplier, error: supplierError } = await supabaseClient
      .from('suppliers')
      .select('name, code, rif')
      .eq('id', supplierId)
      .single();

    if (supplierError || !supplier) {
      return new Response(JSON.stringify({ error: 'Proveedor no encontrado.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch price history data for the supplier, joining material and PO details
    const { data: history, error: historyError } = await supabaseClient
      .from('price_history')
      .select(`
        *,
        materials (name, code, unit),
        units_of_measure (name),
        purchase_orders (sequence_number, created_at)
      `)
      .eq('supplier_id', supplierId)
      .order('recorded_at', { ascending: false });

    if (historyError) {
      console.error('[generate-supplier-price-history-pdf] Error fetching history:', historyError);
      throw historyError;
    }

    // --- PDF Setup ---
    const pdfDoc = await PDFDocument.create();
    // Use A4_LANDSCAPE for horizontal format
    let page = pdfDoc.addPage(PageSizes.A4_LANDSCAPE);
    const { width, height } = page.getSize();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // PDF State Management Interface
    interface PDFState {
      page: PDFPage;
      y: number;
      width: number;
      height: number;
      font: any;
      boldFont: any;
    }

    let state: PDFState = { page, y: height - MARGIN, width, height, font, boldFont };

    // --- Core Drawing Helpers (Defined inside to access embedded fonts) ---
    const drawText = (state: PDFState, text: string, x: number, yPos: number, options: any = {}) => {
      const safeText = String(text || 'N/A');
      state.page.drawText(safeText, {
        x,
        y: yPos,
        font: options.font || state.font,
        size: options.size || FONT_SIZE,
        color: rgb(0, 0, 0),
        ...options,
      });
    };

    // --- Table Column Configuration (Adjusted for Landscape A4: ~780px width) ---
    const tableWidth = width - 2 * MARGIN; // Approx 780px
    const colWidths = [
      tableWidth * 0.40,  // 0. Material / Código
      tableWidth * 0.10,  // 1. UoM
      tableWidth * 0.15,  // 2. P. Original
      tableWidth * 0.15,  // 3. P. Conv (USD)
      tableWidth * 0.20,  // 4. N° OC
    ];
    const colHeaders = ['Material / Código', 'UoM', 'P. Original', 'P. Conv (USD)', 'N° OC'];

    const drawTableHeader = (state: PDFState): PDFState => {
      let currentX = MARGIN;
      state.page.drawLine({
        start: { x: MARGIN, y: state.y - 15 },
        end: { x: MARGIN + tableWidth, y: state.y - 15 },
        thickness: 1,
        color: LIGHT_GRAY,
      });

      for (let i = 0; i < colHeaders.length; i++) {
        drawText(state, colHeaders[i], currentX, state.y - 10, {
          font: boldFont,
          size: 8,
          color: PROC_RED
        });
        currentX += colWidths[i];
      }
      state.y -= 20;
      return state;
    };

    const checkPageBreak = (pdfDoc: PDFDocument, state: PDFState, requiredSpace: number, drawHeader: (state: PDFState) => PDFState): PDFState => {
      // Check if required space pushes content below the footer area
      if (state.y - requiredSpace < MARGIN + LINE_HEIGHT * 2) {
        state.page = pdfDoc.addPage(PageSizes.A4_LANDSCAPE); // Ensure Landscape on new page
        state.y = state.height - MARGIN;
        state = drawHeader(state); // Redraw headers on new page
      }
      return state;
    };
    // --------------------------------------------------------------------

    // --- Header ---
    drawText(state, 'REPORTE DE HISTORIAL DE PRECIOS POR PROVEEDOR', MARGIN, state.y, { font: boldFont, size: 16, color: PROC_RED });
    state.y -= LINE_HEIGHT * 2;

    drawText(state, `PROVEEDOR: ${supplier.name} (${supplier.code || supplier.rif})`, MARGIN, state.y, { font: boldFont, size: 12 });
    state.y -= LINE_HEIGHT;
    drawText(state, `Moneda Base de Comparación: USD`, MARGIN, state.y, { font: boldFont, size: 10 });
    state.y -= LINE_HEIGHT;
    drawText(state, `Fecha de Generación: ${new Date().toLocaleDateString('es-VE')}`, MARGIN, state.y, { size: 9, color: DARK_GRAY });
    state.y -= LINE_HEIGHT * 2;

    state.page.drawLine({
      start: { x: MARGIN, y: state.y },
      end: { x: width - MARGIN, y: state.y },
      thickness: 2,
      color: PROC_RED,
    });
    state.y -= LINE_HEIGHT * 2;

    // --- Price History Table ---
    state = drawTableHeader(state);

    if (history.length === 0) {
      drawText(state, 'No se encontró historial de precios para este proveedor.', MARGIN, state.y - 20);
    } else {
      // Group history by date
      const grouped: Record<string, { rate: number | null, entries: any[] }> = {};
      history.forEach(h => {
        const d = new Date(h.recorded_at).toLocaleDateString('es-VE');
        if (!grouped[d]) grouped[d] = { rate: h.exchange_rate, entries: [] };
        grouped[d].entries.push(h);
      });

      for (const [date, group] of Object.entries(grouped)) {
        state = checkPageBreak(pdfDoc, state, 40, drawTableHeader);
        
        // Draw Date Group Header
        state.page.drawRectangle({
          x: MARGIN,
          y: state.y - 12,
          width: tableWidth,
          height: 12,
          color: rgb(0.96, 0.96, 0.96)
        });
        drawText(state, `FECHA: ${date}   TASA: ${group.rate?.toFixed(2) || 'N/A'}`, MARGIN + 5, state.y - 9, { font: boldFont, size: 8, color: DARK_GRAY });
        state.y -= 15;

        for (const entry of group.entries) {
          const materialName = `${entry.materials?.name || 'N/A'} (${entry.materials?.code || ''})`;
          const materialLines = wrapText(materialName, 60);
          const rowHeight = Math.max(12, materialLines.length * 10);
          
          state = checkPageBreak(pdfDoc, state, rowHeight + 5, drawTableHeader);

          let curX = MARGIN;
          let sY = state.y;
          materialLines.forEach(l => {
            drawText(state, l, curX, sY - 9, { size: 8 });
            sY -= 10;
          });
          curX += colWidths[0];

          const verticalY = state.y - 9;

          // Col 1: UoM
          drawText(state, entry.units_of_measure?.name || entry.unit || entry.materials?.unit || 'N/A', curX, verticalY, { size: 8 });
          curX += colWidths[1];

          // Col 2: P. Original
          drawText(state, `${entry.unit_price.toFixed(2)} ${entry.currency}`, curX, verticalY, { size: 8 });
          curX += colWidths[2];

          // Col 3: P. Conv (USD)
          const usd = convertPriceToUSD(entry);
          drawText(state, usd ? `${usd.toFixed(2)} USD` : 'N/A', curX, verticalY, { font: boldFont, size: 8 });
          curX += colWidths[3];

          // Col 4: N° OC
          const po = entry.purchase_orders;
          drawText(state, po ? formatSequenceNumber(po.sequence_number, po.created_at) : 'N/A', curX, verticalY, { size: 8 });

          state.y -= rowHeight + 2;
        }
        state.y -= 5;
      }
    }

      // Draw final bottom border for the table
      state.page.drawLine({
        start: { x: MARGIN, y: state.y },
        end: { x: MARGIN + tableWidth, y: state.y },
        thickness: 1,
        color: LIGHT_GRAY,
      });
    }

    state.y -= LINE_HEIGHT * 4;

    // --- Footer ---
    const footerY = MARGIN;
    drawText(state, `Generado por: ${user.email}`, MARGIN, footerY);

    const pdfBytes = await pdfDoc.save();

    // Format filename
    const safeSupplierName = (supplierName || 'Proveedor').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    const filename = `Historial_Precios_Proveedor_${safeSupplierName}_USD_${new Date().toLocaleDateString('es-VE').replace(/\//g, '-')}.pdf`;

    return new Response(pdfBytes, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${sanitizeFilename(filename)}"`,
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during PDF generation.';
    console.error('[generate-supplier-price-history-pdf] General Error:', errorMessage, error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});