import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { PDFDocument, rgb, StandardFonts, PDFPage } from 'https://esm.sh/pdf-lib@1.17.1';

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
const TIGHT_LINE_SPACING = FONT_SIZE * 1.1; // Tighter spacing for wrapped text
const MIN_ROW_HEIGHT = LINE_HEIGHT * 2; // Increased for better spacing

// --- UTILITY FUNCTIONS ---

// Helper function to format PO sequence number
const formatSequenceNumber = (sequence?: number, dateString?: string): string => {
  if (!sequence) return 'N/A';

  const date = dateString ? new Date(dateString) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const seq = String(sequence).padStart(3, '0');

  return `OC-${year}-${month}-${seq}`;
};

// Helper function to convert price to the base currency (always USD for this report)
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

// PDF State Management
interface PDFState {
  page: PDFPage;
  y: number;
  width: number;
  height: number;
  font: any;
  boldFont: any;
}

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

const checkPageBreak = (pdfDoc: PDFDocument, state: PDFState, requiredSpace: number, drawHeader: (state: PDFState) => PDFState): PDFState => {
  // Check if required space pushes content below the footer area
  if (state.y - requiredSpace < MARGIN + LINE_HEIGHT * 2) {
    state.page = pdfDoc.addPage();
    state.y = state.height - MARGIN;
    state = drawHeader(state); // Redraw headers on new page
  }
  return state;
};

// --- MAIN SERVE HANDLER ---

serve(async (req: Request) => {
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

    const { materialId, materialName } = await req.json();
    console.log(`[generate-material-price-history-pdf] Generating PDF for material ID: ${materialId} by user: ${user.email}`);

    if (!materialId) {
      return new Response(JSON.stringify({ error: 'Material ID es requerido.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch material details and price history
    const { data: material, error: materialError } = await supabaseClient
      .from('materials')
      .select('name, code')
      .eq('id', materialId)
      .single();

    if (materialError || !material) {
      return new Response(JSON.stringify({ error: 'Material no encontrado.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: history, error: historyError } = await supabaseClient
      .from('price_history')
      .select(`
        *,
        suppliers (name, code),
        units_of_measure (name),
        purchase_orders (sequence_number, created_at)
      `)
      .eq('material_id', materialId)
      .order('recorded_at', { ascending: false });

    if (historyError) {
      console.error('[generate-material-price-history-pdf] Error fetching history:', historyError);
      throw historyError;
    }

    // --- PDF Setup ---
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage();
    const { width, height } = page.getSize();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let state: PDFState = { page, y: height - MARGIN, width, height, font, boldFont };
    const tableWidth = width - (2 * MARGIN);

    // Columns: Proveedor, P. Original, P. Conv (USD), UoM, N° OC
    const colWidths = [
      tableWidth * 0.35,  // 0. Proveedor
      tableWidth * 0.18,  // 1. P. Original
      tableWidth * 0.15,  // 2. P. Conv (USD)
      tableWidth * 0.12,  // 3. UoM
      tableWidth * 0.20,  // 4. N° OC
    ];
    const colHeaders = ['Proveedor', 'P. Original', 'P. Conv (USD)', 'UoM', 'N° OC'];

    const drawTableHeader = (state: PDFState): PDFState => {
      let currentX = MARGIN;
      state.page.drawLine({
        start: { x: MARGIN, y: state.y - LINE_HEIGHT },
        end: { x: MARGIN + tableWidth, y: state.y - LINE_HEIGHT },
        thickness: 1,
        color: LIGHT_GRAY,
      });

      for (let i = 0; i < colHeaders.length; i++) {
        drawText(state, colHeaders[i], currentX, state.y - LINE_HEIGHT + (LINE_HEIGHT - FONT_SIZE) / 2, {
          font: boldFont,
          size: 8,
          color: DARK_GRAY
        });
        currentX += colWidths[i];
      }
      state.y -= LINE_HEIGHT * 1.5;
      return state;
    };

    // --- Header (Minimalist Clean Style) ---
    drawText(state, 'REPORTE DE HISTORIAL DE PRECIOS', MARGIN, state.y, { font: boldFont, size: 14, color: PROC_RED });
    state.y -= LINE_HEIGHT * 1.5;
    
    drawText(state, `MATERIAL: ${material.name} (${material.code})`, MARGIN, state.y, { font: boldFont, size: 11 });
    state.y -= LINE_HEIGHT * 1.2;
    
    drawText(state, `Moneda Base: USD | Generado: ${new Date().toLocaleDateString('es-VE')}`, MARGIN, state.y, { size: 8, color: DARK_GRAY });
    state.y -= LINE_HEIGHT * 1.5;

    // --- Price History List ---

    // --- Price History Table ---
    state = drawTableHeader(state);

    if (history.length === 0) {
      drawText(state, 'No se encontró historial de precios para este material.', MARGIN, state.y - LINE_HEIGHT);
      state.y -= LINE_HEIGHT * 2;
    } else {
      // Group history by date
      const groupedHistory: Record<string, { rate: number | null, entries: any[] }> = {};
      
      history.forEach((entry: any) => {
        // Use the purchase order date if available, otherwise fallback to recorded_at
        const entryDate = entry.purchase_orders?.created_at || entry.recorded_at;
        const dateKey = new Date(entryDate).toLocaleDateString('es-VE');
        if (!groupedHistory[dateKey]) {
          groupedHistory[dateKey] = { rate: entry.exchange_rate, entries: [] };
        }
        groupedHistory[dateKey].entries.push(entry);
      });

      for (const [date, group] of Object.entries(groupedHistory)) {
        const rateText = group.rate ? `Tasa: ${group.rate.toFixed(2)}` : 'Tasa: N/A';

        // Check space for Group Header
        state = checkPageBreak(pdfDoc, state, LINE_HEIGHT * 2, drawTableHeader);

        // Draw Date Group Header
        state.page.drawRectangle({
          x: MARGIN,
          y: state.y - LINE_HEIGHT,
          width: tableWidth,
          height: LINE_HEIGHT,
          color: rgb(0.97, 0.97, 0.97),
        });
        drawText(state, `Fecha: ${date}   ${rateText}`, MARGIN + 5, state.y - LINE_HEIGHT + (LINE_HEIGHT - FONT_SIZE) / 2, { font: boldFont, size: 8, color: DARK_GRAY });
        state.y -= LINE_HEIGHT;

        for (const entry of group.entries) {
          const convertedPrice = convertPriceToUSD(entry);
          
          // Format Order Number
          const orderSequence = entry.purchase_orders?.sequence_number;
          const orderDate = entry.purchase_orders?.created_at;
          const orderNumber = orderSequence ? formatSequenceNumber(orderSequence, orderDate) : 'N/A';

          const supplierName = entry.suppliers?.name || 'N/A';
          const uomName = entry.units_of_measure?.name || entry.unit || 'N/A';

          // Wrapped Supplier Name
          const maxCharsPerLine = 35; // Reduced to avoid column overlap
          const supplierLines = wrapText(supplierName, maxCharsPerLine);
          const rowHeight = Math.max(LINE_HEIGHT * 1.5, supplierLines.length * (TIGHT_LINE_SPACING + 2));

          state = checkPageBreak(pdfDoc, state, rowHeight + 5, drawTableHeader);

          // Draw Row Separator
          state.page.drawLine({
            start: { x: MARGIN, y: state.y },
            end: { x: MARGIN + tableWidth, y: state.y },
            thickness: 0.5,
            color: LIGHT_GRAY,
          });

          let currentX = MARGIN;

          // Col 0: Prov
          let supplierY = state.y;
          for (const line of supplierLines) {
            drawText(state, line, currentX, supplierY - FONT_SIZE);
            supplierY -= TIGHT_LINE_SPACING;
          }
          currentX += colWidths[0];

          // Other columns
          const verticalY = state.y - FONT_SIZE;
          const origPriceText = `${entry.unit_price.toFixed(2)} ${entry.currency}`;
          drawText(state, origPriceText, currentX, verticalY);
          currentX += colWidths[1];

          const convPriceText = convertedPrice !== null ? `${convertedPrice.toFixed(2)} USD` : 'N/A';
          drawText(state, convPriceText, currentX, verticalY, { font: boldFont });
          currentX += colWidths[2];

          drawText(state, uomName, currentX, verticalY);
          currentX += colWidths[3];

          drawText(state, orderNumber, currentX, verticalY);

          state.y -= rowHeight + 2; // Added small padding between rows
        }
        state.y -= 5; // Space between groups
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
    const safeMaterialName = (materialName || 'Material').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    const filename = `Historial_Precios_${safeMaterialName}_USD_${new Date().toLocaleDateString('es-VE').replace(/\//g, '-')}.pdf`;

    return new Response(pdfBytes, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${sanitizeFilename(filename)}"`,
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during PDF generation.';
    console.error('[generate-material-price-history-pdf] General Error:', errorMessage, error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});