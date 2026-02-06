import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { PDFDocument, rgb, StandardFonts, PDFPage } from 'https://esm.sh/pdf-lib@1.17.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- CONSTANTS ---
const PROC_RED = rgb(0.533, 0.039, 0.039); // #880a0a
const LIGHT_GRAY = rgb(0.9, 0.9, 0.9);
const DARK_GRAY = rgb(0.5, 0.5, 0.5);
const MARGIN = 30;
const FONT_SIZE = 9;
const LINE_HEIGHT = FONT_SIZE * 1.2;
const TIGHT_LINE_SPACING = FONT_SIZE * 1.1; // Tighter spacing for wrapped text
const MIN_ROW_HEIGHT = LINE_HEIGHT * 1.5; // Minimum height for single line content

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

    // --- Table Column Configuration ---
    const tableWidth = width - 2 * MARGIN;
    // Columns: Proveedor, Precio Original, Moneda, Tasa, Precio Convertido (USD), N° OC, Fecha
    // Total width = 100%
    const colWidths = [
      tableWidth * 0.25,  // 0. Proveedor (25%)
      tableWidth * 0.12,  // 1. Precio Original (12%)
      tableWidth * 0.08,  // 2. Moneda (8%)
      tableWidth * 0.12,  // 3. Tasa (12%)
      tableWidth * 0.18,  // 4. Precio Convertido (USD) (18%)
      tableWidth * 0.17,  // 5. N° OC (17%)
      tableWidth * 0.08,  // 6. Fecha (8%)
    ];
    const colHeaders = [
      'Proveedor', 'Precio Orig.', 'Moneda', 'Tasa (USD/VES)', 
      'Precio Convertido (USD)', 'N° Orden Compra', 'Fecha'
    ];
    
    const drawTableHeader = (state: PDFState): PDFState => {
      let currentX = MARGIN;
      
      // Draw thin gray line below header row
      state.page.drawLine({
        start: { x: MARGIN, y: state.y - LINE_HEIGHT },
        end: { x: MARGIN + tableWidth, y: state.y - LINE_HEIGHT },
        thickness: 1,
        color: LIGHT_GRAY,
      });
      
      for (let i = 0; i < colHeaders.length; i++) {
        // Determine alignment for header text
        const isRightAligned = [1, 3, 4].includes(i); // Precio Orig, Tasa, Precio Convertido
        
        const headerText = colHeaders[i];
        const textWidth = state.boldFont.widthOfTextAtSize(headerText, 8);
        
        let xPos;
        if (isRightAligned) {
            // Align header text to the right of the column, with 2pt padding
            xPos = currentX + colWidths[i] - 2 - textWidth;
        } else {
            // Align header text to the left of the column, with 2pt padding
            xPos = currentX + 2;
        }

        drawText(state, headerText, xPos, state.y - LINE_HEIGHT + (LINE_HEIGHT - FONT_SIZE) / 2, { 
          font: boldFont, 
          size: 8, 
          color: PROC_RED
        });
        currentX += colWidths[i];
      }
      state.y -= LINE_HEIGHT;
      return state;
    };

    // --- Header ---
    drawText(state, 'REPORTE DE HISTORIAL DE PRECIOS', MARGIN, state.y, { font: boldFont, size: 16, color: PROC_RED });
    state.y -= LINE_HEIGHT * 2;
    
    drawText(state, `MATERIAL: ${material.name} (${material.code})`, MARGIN, state.y, { font: boldFont, size: 12 });
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

    // --- Table ---
    state = drawTableHeader(state);

    if (history.length === 0) {
        drawText(state, 'No se encontró historial de precios para este material.', MARGIN, state.y - LINE_HEIGHT);
        state.y -= LINE_HEIGHT * 2;
    } else {
        for (const entry of history) {
            const convertedPrice = convertPriceToUSD(entry);
            
            // Format Order Number
            const orderSequence = entry.purchase_orders?.sequence_number;
            const orderDate = entry.purchase_orders?.created_at;
            const orderNumber = orderSequence ? formatSequenceNumber(orderSequence, orderDate) : 'N/A';

            // --- Calculate required row height based on wrapped Supplier Name ---
            // Max characters per line for 25% width (approx 30 chars per line)
            const maxCharsPerLine = 30; 
            const supplierLines = wrapText(entry.suppliers?.name || 'N/A', maxCharsPerLine);
            
            // Calculate height based on tighter line spacing
            const requiredTextHeight = supplierLines.length * TIGHT_LINE_SPACING + 5; // Add padding
            
            // Determine final row height
            const rowHeight = Math.max(MIN_ROW_HEIGHT, requiredTextHeight); 
            
            state = checkPageBreak(pdfDoc, state, rowHeight + 5, drawTableHeader); 

            // Draw separator line above row content
            state.page.drawLine({
                start: { x: MARGIN, y: state.y },
                end: { x: MARGIN + tableWidth, y: state.y },
                thickness: 0.5,
                color: LIGHT_GRAY,
            });

            let currentX = MARGIN;
            const finalY = state.y - rowHeight;
            const verticalCenterY = finalY + rowHeight / 2 - FONT_SIZE / 2;

            // Helper to draw data
            const drawCellData = (text: string, colIndex: number, isRightAligned: boolean = false, fontToUse: any = font) => {
                const cellWidth = colWidths[colIndex];
                const textWidth = fontToUse.widthOfTextAtSize(text, FONT_SIZE);
                
                let xPos;
                if (isRightAligned) {
                    xPos = currentX + cellWidth - 2 - textWidth; // Right aligned
                } else {
                    xPos = currentX + 2; // Left aligned
                }
                
                drawText(state, text, xPos, verticalCenterY, { font: fontToUse });
                currentX += cellWidth;
            };
            
            // 0. Proveedor (Multi-line, Left Aligned)
            let currentY = state.y - 3; // Start drawing 3 points below the top line
            for (const line of supplierLines) {
                drawText(state, line, currentX + 2, currentY - FONT_SIZE, { size: FONT_SIZE }); 
                currentY -= TIGHT_LINE_SPACING;
            }
            currentX += colWidths[0];

            // 1. Precio Original (Right Aligned)
            drawCellData(entry.unit_price.toFixed(2), 1, true);

            // 2. Moneda (Left Aligned)
            drawCellData(entry.currency, 2);

            // 3. Tasa (Right Aligned)
            drawCellData(entry.exchange_rate ? entry.exchange_rate.toFixed(4) : 'N/A', 3, true);

            // 4. Precio Convertido (USD) (Right Aligned, Bold)
            const convertedText = convertedPrice !== null ? `USD ${convertedPrice.toFixed(2)}` : 'N/A';
            drawCellData(convertedText, 4, true, boldFont);

            // 5. N° OC (Left Aligned)
            drawCellData(orderNumber, 5);

            // 6. Fecha (Left Aligned)
            const dateText = new Date(entry.recorded_at).toLocaleDateString('es-VE');
            drawCellData(dateText, 6);

            state.y = finalY; // Update Y position for the next row
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
        'Content-Disposition': `attachment; filename="${filename}"`,
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