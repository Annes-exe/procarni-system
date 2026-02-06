import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { PDFDocument, rgb, StandardFonts, PDFPage, PageSizes } from 'https://esm.sh/pdf-lib@1.17.1'; // Import PageSizes

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
    // Columns: Material, Cód. Material, Precio Unitario, Moneda, Tasa, Precio Convertido (USD), N° OC
    // Total 7 columns.
    const colWidths = [
      tableWidth * 0.30,  // 0. Material (30%)
      tableWidth * 0.10,  // 1. Cód. Material (10%) - REDUCED
      tableWidth * 0.12,  // 2. Precio Unitario (12%)
      tableWidth * 0.08,  // 3. Moneda (8%) - REDUCED
      tableWidth * 0.12,  // 4. Tasa (12%)
      tableWidth * 0.18,  // 5. Precio Convertido (USD) (18%) - INCREASED
      tableWidth * 0.10,  // 6. N° OC (10%)
    ];
    const colHeaders = [
      'Material', 'Cód. Mat.', 'P. Unit.', 'Moneda', 'Tasa (USD/VES)', 
      'Precio Convertido (USD)', 'N° Orden Compra'
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
        // Determine alignment for header text (Indices: 1, 2, 4, 5 are right aligned)
        const isRightAligned = [1, 2, 4, 5].includes(i); 
        
        const headerText = colHeaders[i];
        const textWidth = state.boldFont.widthOfTextAtSize(headerText, 7); // Use smaller font for headers
        
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
          size: 7, // Smaller header font
          color: PROC_RED
        });
        currentX += colWidths[i];
      }
      state.y -= LINE_HEIGHT;
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

    // --- Table ---
    state = drawTableHeader(state);

    if (history.length === 0) {
        drawText(state, 'No se encontró historial de precios para este proveedor.', MARGIN, state.y - LINE_HEIGHT);
        state.y -= LINE_HEIGHT * 2;
    } else {
        for (const entry of history) {
            const convertedPrice = convertPriceToUSD(entry);
            
            // Format Order Number
            const orderSequence = entry.purchase_orders?.sequence_number;
            const orderDate = entry.purchase_orders?.created_at;
            const orderNumber = orderSequence ? formatSequenceNumber(orderSequence, orderDate) : 'N/A';

            // --- Calculate required row height based on wrapped Material Name ---
            const maxCharsPerLine = 40; 
            const materialLines = wrapText(entry.materials?.name || 'N/A', maxCharsPerLine);
            
            const requiredTextHeight = materialLines.length * TIGHT_LINE_SPACING + 5; 
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
            
            // 0. Material (Multi-line, Left Aligned)
            let currentY = state.y - 3; 
            for (const line of materialLines) {
                drawText(state, line, currentX + 2, currentY - FONT_SIZE, { size: FONT_SIZE }); 
                currentY -= TIGHT_LINE_SPACING;
            }
            currentX += colWidths[0];

            // 1. Cód. Material (Right Aligned)
            drawCellData(entry.materials?.code || 'N/A', 1, true);

            // 2. Precio Unitario (Right Aligned)
            drawCellData(entry.unit_price.toFixed(2), 2, true);

            // 3. Moneda (Left Aligned)
            drawCellData(entry.currency, 3);

            // 4. Tasa (Right Aligned)
            drawCellData(entry.exchange_rate ? entry.exchange_rate.toFixed(4) : 'N/A', 4, true);

            // 5. Precio Convertido (USD) (Right Aligned, Bold)
            const convertedText = convertedPrice !== null ? `USD ${convertedPrice.toFixed(2)}` : 'N/A';
            drawCellData(convertedText, 5, true, boldFont);

            // 6. N° OC (Left Aligned)
            drawCellData(orderNumber, 6);

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
    const safeSupplierName = (supplierName || 'Proveedor').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    const filename = `Historial_Precios_Proveedor_${safeSupplierName}_USD_${new Date().toLocaleDateString('es-VE').replace(/\//g, '-')}.pdf`;

    return new Response(pdfBytes, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
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