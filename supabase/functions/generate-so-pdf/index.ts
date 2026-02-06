import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'https://esm.sh/pdf-lib@1.17.1';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- CONSTANTS ---
const PROC_RED = rgb(0.533, 0.039, 0.039); // #880a0a
const LIGHT_GRAY = rgb(0.9, 0.9, 0.9);
const DARK_GRAY = rgb(0.5, 0.5, 0.5);
const MARGIN = 30;
const FONT_SIZE = 10;
const LINE_HEIGHT = FONT_SIZE * 1.2;
const COMPANY_NAME_FONT_SIZE = 12;
const LOGO_SIZE = 50;

// --- UTILITY FUNCTIONS (Kept outside serve) ---

const calculateTotals = (items: Array<{
    quantity: number | null | undefined;
    unit_price: number | null | undefined;
    tax_rate?: number | null | undefined;
    is_exempt?: boolean | null | undefined;
    sales_percentage?: number | null | undefined;
    discount_percentage?: number | null | undefined;
}>) => {
    let baseImponible = 0;
    let montoIVA = 0;
    let montoVenta = 0;
    let montoDescuento = 0;
    let total = 0;

    items.forEach(item => {
        const quantity = item.quantity ?? 0;
        const unitPrice = item.unit_price ?? 0;
        const itemValue = quantity * unitPrice;

        // Ensure percentages are treated as numbers, defaulting to 0
        const discountRate = (item.discount_percentage ?? 0) / 100;
        const salesRate = (item.sales_percentage ?? 0) / 100;
        const taxRate = item.tax_rate ?? 0.16;

        // 1. Apply Discount
        const discountAmount = itemValue * discountRate;
        montoDescuento += discountAmount;

        const subtotalAfterDiscount = itemValue - discountAmount;

        // 2. Calculate Base Imponible (Subtotal after discount, before taxes)
        baseImponible += subtotalAfterDiscount;

        // 3. Apply Sales Percentage (Additional Tax)
        const salesAmount = subtotalAfterDiscount * salesRate;
        montoVenta += salesAmount;

        // 4. Apply IVA (Standard Tax)
        let ivaAmount = 0;
        if (!item.is_exempt) {
            ivaAmount = subtotalAfterDiscount * taxRate;
            montoIVA += ivaAmount;
        }

        // 5. Calculate Total Item
        total += subtotalAfterDiscount + salesAmount + ivaAmount;
    });

    return {
        baseImponible: parseFloat(baseImponible.toFixed(2)),
        montoIVA: parseFloat(montoIVA.toFixed(2)),
        montoVenta: parseFloat(montoVenta.toFixed(2)),
        montoDescuento: parseFloat(montoDescuento.toFixed(2)),
        total: parseFloat(total.toFixed(2)),
    };
};

const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVNTA'];
const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
const especiales = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];

function convertirGrupo(num: number): string {
    let c = Math.floor(num / 100);
    let d = Math.floor((num % 100) / 10);
    let u = num % 10;
    let texto = '';

    if (c === 1 && d === 0 && u === 0) {
        texto += 'CIEN';
    } else if (c > 0) {
        texto += centenas[c] + ' ';
    }

    if (d === 1) {
        texto += especiales[u];
    } else if (d > 1) {
        texto += decenas[d];
        if (u > 0) {
            texto += ' Y ' + unidades[u];
        }
    } else if (u > 0) {
        texto += unidades[u];
    }
    return texto.trim();
}

const numberToWords = (amount: number, currency: 'VES' | 'USD'): string => {
    if (amount === 0) {
        return `CERO ${currency === 'VES' ? 'BOLIVARES' : 'DOLARES'} CON 00/100`;
    }

    const [entero, decimal] = amount.toFixed(2).split('.').map(Number);

    let texto = '';
    let tempEntero = entero;

    if (tempEntero === 1) {
        texto = `UN ${currency === 'VES' ? 'BOLIVAR' : 'DOLAR'}`;
    } else if (tempEntero > 1) {
        let miles = Math.floor(tempEntero / 1000);
        let unidades = tempEntero % 1000;

        if (miles > 0) {
            if (miles === 1) {
                texto += 'MIL ';
            } else {
                texto += convertirGrupo(miles) + ' MIL ';
            }
        }
        texto += convertirGrupo(unidades);

        texto = texto.trim() + ` ${currency === 'VES' ? 'BOLIVARES' : 'DOLARES'}`;
    }

    const decimalTexto = decimal.toString().padStart(2, '0');

    return `${texto} CON ${decimalTexto}/100`.trim();
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

const formatSequenceNumber = (sequence?: number, dateString?: string): string => {
    if (!sequence) return 'N/A';

    const date = dateString ? new Date(dateString) : new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const seq = String(sequence).padStart(3, '0');

    return `OS-${year}-${month}-${seq}`;
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

        const { orderId } = await req.json();
        console.log(`[generate-po-pdf] Generating PDF for order ID: ${orderId} by user: ${user.email}`);

        // --- Data Fetching ---
        const { data: order, error: orderError } = await supabaseClient
            .from('service_orders')
            .select(`
        *,
        suppliers (name, rif, email, phone, payment_terms),
        companies (name, logo_url, fiscal_data, rif, address, phone, email)
      `)
            .eq('id', orderId)
            .single();

        if (orderError || !order) {
            return new Response(JSON.stringify({ error: 'Order not found or access denied.' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const { data: items, error: itemsError } = await supabaseClient
            .from('service_order_items')
            .select('*')
            .eq('order_id', orderId);

        if (itemsError) {
            return new Response(JSON.stringify({ error: 'Error fetching order items.' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Helper function to format payment terms
        const formatPaymentTerms = (order: any) => {
            if (order.payment_terms === 'Otro' && order.custom_payment_terms) {
                return order.custom_payment_terms;
            }
            if (order.payment_terms === 'Crédito' && order.credit_days) {
                return `Crédito (${order.credit_days} días)`;
            }
            return order.payment_terms || 'Contado';
        };

        // Helper to format service dates
        const formatServiceDate = (dateStr: string | null) => {
            if (!dateStr) return 'N/A';
            return new Date(dateStr).toLocaleDateString('es-VE');
        };

        // --- PDF Setup ---
        const pdfDoc = await PDFDocument.create();
        let page = pdfDoc.addPage();
        const { width, height } = page.getSize();

        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

        // Table column configuration (Original 6 columns + 2 new percentage columns)
        const tableWidth = width - 2 * MARGIN;
        // Total 8 columns: Material, Cantidad, Unidad, P. Unitario, Desc. (%), Venta (%), IVA, Total
        const colWidths = [
            tableWidth * 0.25,  // 1. Material/Description (Reduced from 30%)
            tableWidth * 0.08,  // 2. Cantidad
            tableWidth * 0.08,  // 3. Unidad
            tableWidth * 0.12,  // 4. P. Unitario
            tableWidth * 0.08,  // 5. Desc. (%) (NEW)
            tableWidth * 0.08,  // 6. Venta (%) (NEW)
            tableWidth * 0.10,  // 7. IVA (Reduced from 15%)
            tableWidth * 0.21   // 8. Total (Increased from 20%)
        ];
        const colHeaders = ['Servicio/Desc.', 'Cant.', 'Unid.', 'P. Unit.', 'Desc. (%)', 'Venta (%)', 'IVA', 'Total'];

        // PDF State Management
        interface PDFState {
            page: PDFPage;
            y: number;
            width: number;
            height: number;
            font: any;
            boldFont: any;
        }

        let state: PDFState = { page, y: height - MARGIN, width, height, font, boldFont };

        // --- Core Drawing Helpers ---

        const drawText = (state: PDFState, text: string, x: number, yPos: number, options: any = {}) => {
            const safeText = String(text || 'N/A');
            state.page.drawText(safeText, {
                x,
                y: yPos,
                font: font,
                size: FONT_SIZE,
                color: rgb(0, 0, 0),
                ...options,
            });
        };

        const drawBorderedRect = (state: PDFState, x: number, y: number, w: number, h: number, options: any = {}) => {
            state.page.drawRectangle({
                x,
                y,
                width: w,
                height: h,
                borderColor: options.borderColor || LIGHT_GRAY,
                borderWidth: options.borderWidth || 1,
                color: options.color || rgb(1, 1, 1),
            });
        };

        const drawTableHeader = (state: PDFState): PDFState => {
            let currentX = MARGIN;

            state.page.drawLine({
                start: { x: MARGIN, y: state.y - LINE_HEIGHT },
                end: { x: MARGIN + tableWidth, y: state.y - LINE_HEIGHT },
                thickness: 1,
                color: LIGHT_GRAY,
            });

            for (let i = 0; i < colHeaders.length; i++) {
                drawText(state, colHeaders[i], currentX + 5, state.y - LINE_HEIGHT + (LINE_HEIGHT - FONT_SIZE) / 2, {
                    font: boldFont,
                    size: 8, // Reduced font size for headers to fit
                    color: PROC_RED
                });
                currentX += colWidths[i];
            }
            state.y -= LINE_HEIGHT;
            return state;
        };

        const checkPageBreak = (state: PDFState, requiredSpace: number): PDFState => {
            if (state.y - requiredSpace < MARGIN + LINE_HEIGHT * 10) {
                state.page = pdfDoc.addPage();
                state.y = height - MARGIN;
                state = drawTableHeader(state);
            }
            return state;
        };

        // --- Modular Drawing Functions (Header, Details, Observations remain the same) ---

        const drawHeader = async (state: PDFState, order: any): Promise<PDFState> => {
            let companyLogoImage = null;
            if (order.companies?.logo_url) {
                try {
                    const logoResponse = await fetch(order.companies.logo_url);
                    if (logoResponse.ok) {
                        const logoBytes = await logoResponse.arrayBuffer();
                        companyLogoImage = await pdfDoc.embedPng(logoBytes);
                    }
                } catch (logoError) {
                    console.warn(`[generate-po-pdf] Could not load company logo:`, logoError);
                }
            }

            const formattedSequence = formatSequenceNumber(order.sequence_number, order.created_at);

            // 1. Draw Company Logo and Name (Top Left)
            if (companyLogoImage) {
                const logoX = MARGIN;
                const logoY = state.y - LOGO_SIZE;

                state.page.drawImage(companyLogoImage, {
                    x: logoX,
                    y: logoY,
                    width: LOGO_SIZE,
                    height: LOGO_SIZE,
                });

                drawText(state, order.companies?.name || 'N/A', logoX + LOGO_SIZE + 10, state.y - (LOGO_SIZE / 2) + (COMPANY_NAME_FONT_SIZE / 2), {
                    font: boldFont,
                    size: COMPANY_NAME_FONT_SIZE,
                    color: PROC_RED
                });
            } else {
                drawText(state, order.companies?.name || 'N/A', MARGIN, state.y, { font: boldFont, size: COMPANY_NAME_FONT_SIZE, color: PROC_RED });
            }

            // 2. Draw Document Title and Number (Top Right)
            const titleX = width - MARGIN - 150;
            drawText(state, 'ORDEN DE SERVICIO', titleX, state.y, { font: boldFont, size: 16, color: PROC_RED });

            drawText(state, `Nº: ${formattedSequence}`, titleX, state.y - LINE_HEIGHT * 2, { font: boldFont, size: 10 });
            drawText(state, `Fecha: ${new Date(order.created_at).toLocaleDateString('es-VE')}`, titleX, state.y - LINE_HEIGHT, { size: 10 });

            // Update Y position based on the tallest element in the header
            state.y -= Math.max(companyLogoImage ? LOGO_SIZE : LINE_HEIGHT * 3, LINE_HEIGHT * 3);

            // Separator line (Red, 2pt)
            state.page.drawLine({
                start: { x: MARGIN, y: state.y },
                end: { x: width - MARGIN, y: state.y },
                thickness: 2,
                color: PROC_RED,
            });
            state.y -= LINE_HEIGHT * 2;
            return state;
        };

        const drawSupplierDetails = (state: PDFState, order: any): PDFState => {
            // Draw title
            drawText(state, 'DATOS DEL PROVEEDOR:', MARGIN, state.y, { font: boldFont, size: 12, color: PROC_RED });

            // Draw separator line immediately below the title text area
            state.page.drawLine({
                start: { x: MARGIN, y: state.y - FONT_SIZE - 2 },
                end: { x: width - MARGIN, y: state.y - FONT_SIZE - 2 },
                thickness: 0.5,
                color: LIGHT_GRAY,
            });

            state.y -= LINE_HEIGHT * 2;

            drawText(state, `Nombre: ${order.suppliers?.name || 'N/A'}`, MARGIN, state.y);
            state.y -= LINE_HEIGHT;
            drawText(state, `RIF: ${order.suppliers?.rif || 'N/A'}`, MARGIN, state.y);
            state.y -= LINE_HEIGHT * 2;
            return state;
        };

        const drawOrderDetails = (state: PDFState, order: any): PDFState => {
            const paymentTerms = formatPaymentTerms(order);

            // Draw title
            drawText(state, 'DETALLES DE LA ORDEN:', MARGIN, state.y, { font: boldFont, size: 12, color: PROC_RED });

            // Draw separator line immediately below the title text area
            state.page.drawLine({
                start: { x: MARGIN, y: state.y - FONT_SIZE - 2 },
                end: { x: width - MARGIN, y: state.y - FONT_SIZE - 2 },
                thickness: 0.5,
                color: LIGHT_GRAY,
            });

            state.y -= LINE_HEIGHT * 2;

            drawText(state, `Fecha de Servicio: ${formatServiceDate(order.service_date)}`, MARGIN, state.y);
            state.y -= LINE_HEIGHT;
            drawText(state, `Condición de Pago: ${paymentTerms}`, MARGIN, state.y);
            state.y -= LINE_HEIGHT * 2;
            return state;
        };

        const drawObservations = (state: PDFState, order: any): PDFState => {
            if (!order.observations) return state;

            // Draw title
            drawText(state, 'OBSERVACIONES:', MARGIN, state.y, { font: boldFont, size: 12, color: PROC_RED });

            // Draw separator line immediately below the title text area
            state.page.drawLine({
                start: { x: MARGIN, y: state.y - FONT_SIZE - 2 },
                end: { x: width - MARGIN, y: state.y - FONT_SIZE - 2 },
                thickness: 0.5,
                color: LIGHT_GRAY,
            });

            state.y -= LINE_HEIGHT * 2;

            const observationsText = order.observations;
            const maxCharsPerLine = 100;
            const textRuns = wrapText(observationsText, maxCharsPerLine);

            for (const run of textRuns) {
                state = checkPageBreak(state, LINE_HEIGHT);
                drawText(state, run, MARGIN, state.y);
                state.y -= LINE_HEIGHT;
            }
            state.y -= LINE_HEIGHT;
            return state;
        };

        const drawItemsTable = (state: PDFState, items: any[]): PDFState => {
            // Draw title
            drawText(state, 'ÍTEMS DEL SERVICIO:', MARGIN, state.y, { font: boldFont, size: 12, color: PROC_RED });

            // Draw separator line immediately below the title text area
            state.page.drawLine({
                start: { x: MARGIN, y: state.y - FONT_SIZE - 2 },
                end: { x: width - MARGIN, y: state.y - FONT_SIZE - 2 },
                thickness: 0.5,
                color: LIGHT_GRAY,
            });

            state.y -= LINE_HEIGHT * 2;

            state = drawTableHeader(state);

            for (let i = 0; i < items.length; i++) {
                const item = items[i];

                // Calculate item totals using the updated function
                const totals = calculateTotals([{
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    tax_rate: item.tax_rate,
                    is_exempt: item.is_exempt,
                    sales_percentage: item.sales_percentage ?? 0,
                    discount_percentage: item.discount_percentage ?? 0,
                }]);

                // CORRECTED: Map the Spanish keys from calculateTotals to local variables
                const subtotalAfterDiscount = totals.baseImponible; // Base Imponible is subtotal after discount
                const discountAmount = totals.montoDescuento;
                const salesAmount = totals.montoVenta;
                const itemIva = totals.montoIVA;
                const totalItem = totals.total;

                // Combine material name and description for the first column
                let materialContent = String(item.material_name || '');

                if (item.supplier_code || item.description) {
                    if (item.supplier_code) {
                        materialContent += `\n(Cód. Prov: ${item.supplier_code})`;
                    }
                    if (item.description) {
                        materialContent += `\n${item.description}`;
                    }
                }

                // Wrap the combined content for the first column (25% width, approx 30 chars per line)
                const materialLines = wrapText(materialContent, 30);
                const lineSpacing = (FONT_SIZE - 1) * 1.2;
                const requiredHeight = materialLines.length * lineSpacing + 5;

                state = checkPageBreak(state, requiredHeight + 10);

                // Draw thin gray line above the row content (to separate rows)
                state.page.drawLine({
                    start: { x: MARGIN, y: state.y },
                    end: { x: MARGIN + tableWidth, y: state.y },
                    thickness: 0.5,
                    color: LIGHT_GRAY,
                });

                let currentX = MARGIN;
                let currentY = state.y - 3;

                // 1. Material/Description (Multi-line)
                for (const line of materialLines) {
                    drawText(state, line, currentX + 5, currentY - (FONT_SIZE - 1), { size: FONT_SIZE - 1 });
                    currentY -= lineSpacing;
                }
                currentX += colWidths[0];

                const finalY = state.y - requiredHeight;

                // Helper to draw data centered vertically and right-aligned
                const drawCellData = (text: string, colIndex: number, isRightAligned: boolean = true, size: number = FONT_SIZE, fontToUse: any = font) => {
                    const cellWidth = colWidths[colIndex];
                    const textWidth = fontToUse.widthOfTextAtSize(text, size);

                    const verticalCenterY = finalY + requiredHeight / 2 - size / 2;

                    const xPos = isRightAligned
                        ? currentX + cellWidth - 5 - textWidth
                        : currentX + 5;

                    drawText(state, text, xPos, verticalCenterY, { size, font: fontToUse });
                    currentX += cellWidth;
                };

                // 2. Cantidad
                drawCellData(String(item.quantity ?? 0), 1); // Ensure quantity is safely accessed

                // 3. Unidad
                drawCellData(item.unit || 'UND', 2);

                // 4. P. Unitario
                drawCellData((item.unit_price ?? 0).toFixed(2), 3);

                // 5. Desc. (%) (NEW)
                drawCellData(`${(item.discount_percentage ?? 0).toFixed(2)}%`, 4);

                // 6. Venta (%) (NEW)
                drawCellData(`${(item.sales_percentage ?? 0).toFixed(2)}%`, 5);

                // 7. IVA
                drawCellData(item.is_exempt ? 'EXENTO' : itemIva.toFixed(2), 6);

                // 8. Total
                drawCellData(totalItem.toFixed(2), 7, true, FONT_SIZE + 1, boldFont); // Slightly larger font for total

                state.y = finalY; // Update Y position for the next row
            }

            state.page.drawLine({
                start: { x: MARGIN, y: state.y },
                end: { x: MARGIN + tableWidth, y: state.y },
                thickness: 1,
                color: LIGHT_GRAY,
            });

            state.y -= LINE_HEIGHT * 2;
            return state;
        };

        const drawTotalsAndSummary = (state: PDFState, order: any, items: any[]): PDFState => {
            const calculatedTotals = calculateTotals(items.map(item => ({
                quantity: item.quantity,
                unit_price: item.unit_price,
                tax_rate: item.tax_rate,
                is_exempt: item.is_exempt,
                sales_percentage: item.sales_percentage ?? 0,
                discount_percentage: item.discount_percentage ?? 0,
            })));

            const totalSectionWidth = 200;
            const totalSectionX = width - MARGIN - totalSectionWidth;

            // Determine number of rows needed for totals
            let totalRows = 5;
            let hasUsdTotal = false;
            if (order.currency === 'VES' && order.exchange_rate && order.exchange_rate > 0) {
                totalRows = 6;
                hasUsdTotal = true;
            }

            const totalRowHeight = LINE_HEIGHT * 1.5;
            const totalSectionHeight = totalRowHeight * totalRows + 5;

            state = checkPageBreak(state, totalSectionHeight + LINE_HEIGHT * 3);

            // Draw the outer box
            drawBorderedRect(state, totalSectionX, state.y - totalSectionHeight, totalSectionWidth, totalSectionHeight, {
                borderColor: LIGHT_GRAY,
                borderWidth: 1,
            });

            let currentY = state.y - 5;

            const drawTotalRow = (label: string, value: string, isBold: boolean = false, color: rgb = rgb(0, 0, 0), size: number = FONT_SIZE) => {
                const fontToUse = isBold ? boldFont : font;

                const verticalCenterY = currentY - totalRowHeight / 2 + size / 2;

                // Draw label (left aligned)
                drawText(state, label, totalSectionX + 5, verticalCenterY, { font: fontToUse, size, color });

                // Draw value (right aligned)
                const valueWidth = fontToUse.widthOfTextAtSize(value, size);
                drawText(state, value, totalSectionX + totalSectionWidth - 5 - valueWidth, verticalCenterY, { font: fontToUse, size, color });

                currentY -= totalRowHeight;
            };

            // Draw rows
            drawTotalRow('Base Imponible:', `${order.currency} ${calculatedTotals.baseImponible.toFixed(2)}`);

            // NEW: Descuento
            drawTotalRow('Monto Descuento:', `- ${order.currency} ${calculatedTotals.montoDescuento.toFixed(2)}`, false, PROC_RED);

            // NEW: Venta
            drawTotalRow('Monto Venta:', `+ ${order.currency} ${calculatedTotals.montoVenta.toFixed(2)}`, false, PROC_RED);

            drawTotalRow('Monto IVA:', `+ ${order.currency} ${calculatedTotals.montoIVA.toFixed(2)}`);

            drawTotalRow('TOTAL:', `${order.currency} ${calculatedTotals.total.toFixed(2)}`, true, PROC_RED, FONT_SIZE + 2);

            if (hasUsdTotal) {
                const totalInUSD = (calculatedTotals.total / order.exchange_rate).toFixed(2);
                drawTotalRow('TOTAL (USD):', `USD ${totalInUSD}`, true, DARK_GRAY, FONT_SIZE);
            }

            // Update state.y to be below the total box
            state.y = state.y - totalSectionHeight - LINE_HEIGHT;

            const amountInWords = numberToWords(calculatedTotals.total, order.currency as 'VES' | 'USD');
            drawText(state, `Monto en Letras: ${amountInWords}`, MARGIN, state.y, { font: italicFont });
            state.y -= LINE_HEIGHT * 3;
            return state;
        };

        const drawFooter = (state: PDFState, order: any, user: any): PDFState => {
            const footerY = MARGIN;

            // Left Signature: Elaborado por
            const leftSignatureXCenter = width / 4;
            state.page.drawLine({
                start: { x: leftSignatureXCenter - 60, y: footerY + LINE_HEIGHT },
                end: { x: leftSignatureXCenter + 60, y: footerY + LINE_HEIGHT },
                thickness: 1,
                color: DARK_GRAY,
            });
            const generatedBy = order.created_by || user.email;
            const textWidthLeft = font.widthOfTextAtSize('Elaborado por', 9);
            drawText(state, 'Elaborado por', leftSignatureXCenter - textWidthLeft / 2, footerY, { font: font, size: 9 });

            // Draw User Email below line - REMOVED as per user request
            // const userEmailWidth = font.widthOfTextAtSize(generatedBy, 8);
            // drawText(state, generatedBy, leftSignatureXCenter - userEmailWidth / 2, footerY + 12, { font: font, size: 8 });


            // Right Signature: Revisado por
            const rightSignatureXCenter = (width / 4) * 3;
            state.page.drawLine({
                start: { x: rightSignatureXCenter - 60, y: footerY + LINE_HEIGHT },
                end: { x: rightSignatureXCenter + 60, y: footerY + LINE_HEIGHT },
                thickness: 1,
                color: DARK_GRAY,
            });
            const textWidthRight = font.widthOfTextAtSize('Revisado por', 9);
            drawText(state, 'Revisado por', rightSignatureXCenter - textWidthRight / 2, footerY, { font: font, size: 9 });

            return state;
        };

        // --- Execution Flow ---
        state = await drawHeader(state, order);
        state = drawSupplierDetails(state, order);
        state = drawOrderDetails(state, order);
        state = drawObservations(state, order);
        state = drawItemsTable(state, items);
        state = drawTotalsAndSummary(state, order, items);
        state = drawFooter(state, order, user);

        const pdfBytes = await pdfDoc.save();

        // Format filename as: OC-YYYY-MM-XXX-PROVEEDOR.pdf
        const supplierName = order.suppliers?.name || 'Proveedor';
        const safeSupplierName = supplierName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        const filename = `${formatSequenceNumber(order.sequence_number, order.created_at)}-${safeSupplierName}.pdf`;

        return new Response(pdfBytes, {
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during PDF generation.';
        console.error('[generate-po-pdf] General Error:', errorMessage, error);
        return new Response(JSON.stringify({ error: errorMessage }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
