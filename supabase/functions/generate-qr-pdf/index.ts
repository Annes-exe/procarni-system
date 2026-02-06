import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Define colores corporativos y de borde
const PROC_RED = rgb(0.533, 0.039, 0.039); // #880a0a
const LIGHT_GRAY = rgb(0.9, 0.9, 0.9); // Borde de tabla muy fino
const DARK_GRAY = rgb(0.5, 0.5, 0.5); // Detalles de la empresa

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.warn('[generate-qr-pdf] Unauthorized: No Authorization header');
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
      console.warn('[generate-qr-pdf] Unauthorized: Invalid user session');
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const { requestId } = await req.json();
    console.log(`[generate-qr-pdf] Generating PDF for quote request ID: ${requestId} by user: ${user.email}`);

    // --- Lógica de obtención de datos de la solicitud de cotización ---
    const { data: request, error: requestError } = await supabaseClient
      .from('quote_requests')
      .select(`
        *,
        suppliers (name, rif, email, phone, phone_2, instagram, address),
        companies (name, logo_url, fiscal_data, rif, address, phone, email)
      `)
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      console.error(`[generate-qr-pdf] Error fetching quote request ${requestId}:`, requestError);
      return new Response(JSON.stringify({ error: 'Quote request not found or access denied.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: items, error: itemsError } = await supabaseClient
      .from('quote_request_items')
      .select('*')
      .eq('request_id', requestId);

    if (itemsError) {
      console.error(`[generate-qr-pdf] Error fetching quote request items for ${requestId}:`, itemsError);
      return new Response(JSON.stringify({ error: 'Error fetching quote request items.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Generación de PDF con pdf-lib ---
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage(); 

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const { width, height } = page.getSize();
    const margin = 30; 
    let y = height - margin;
    const fontSize = 10;
    const lineHeight = fontSize * 1.2;
    
    // Helper para dibujar texto
    const drawText = (text: string, x: number, yPos: number, options: any = {}) => {
      page.drawText(text, {
        x,
        y: yPos,
        font: font,
        size: fontSize,
        color: rgb(0, 0, 0),
        ...options,
      });
    };

    // Table column configuration
    const tableX = margin;
    const tableWidth = width - 2 * margin;
    const colWidths = [tableWidth * 0.3, tableWidth * 0.15, tableWidth * 0.15, tableWidth * 0.4];
    const colHeaders = ['Material', 'Cantidad', 'Unidad', 'Descripción'];

    // Function to draw table headers (Red text, thin gray bottom border)
    const drawTableHeader = () => {
      let currentX = tableX;
      
      // Draw thin gray line below header row
      page.drawLine({
        start: { x: tableX, y: y - lineHeight },
        end: { x: tableX + tableWidth, y: y - lineHeight },
        thickness: 1,
        color: LIGHT_GRAY,
      });

      for (let i = 0; i < colHeaders.length; i++) {
        drawText(colHeaders[i], currentX + 5, y - lineHeight + (lineHeight - fontSize) / 2, { font: boldFont, size: 10, color: PROC_RED });
        currentX += colWidths[i];
      }
      y -= lineHeight;
    };

    // Function to check for page breaks and add new page if necessary
    const checkPageBreak = (requiredSpace: number) => {
      if (y - requiredSpace < margin) { 
        page = pdfDoc.addPage();
        y = height - margin;
        drawTableHeader(); // Redraw headers on new page
      }
    };

    // --- Header with Company Logo and Details ---
    let companyLogoImage = null;
    if (request.companies?.logo_url) {
      try {
        const logoResponse = await fetch(request.companies.logo_url);
        if (logoResponse.ok) {
          const logoBytes = await logoResponse.arrayBuffer();
          companyLogoImage = await pdfDoc.embedPng(logoBytes);
        }
      } catch (logoError) {
        console.warn(`[generate-qr-pdf] Could not load company logo:`, logoError);
      }
    }

    // Draw company logo and details
    const companyNameFontSize = 12; // Reduced from 14
    const companyNameLineHeight = companyNameFontSize * 1.2;

    if (companyLogoImage) {
      const logoWidth = 50;
      const logoHeight = 50;
      const logoX = margin;
      const logoY = y - logoHeight;

      page.drawImage(companyLogoImage, {
        x: logoX,
        y: logoY,
        width: logoWidth,
        height: logoHeight,
      });

      // Draw company name (smaller and bold)
      drawText(request.companies?.name || 'N/A', logoX + logoWidth + 10, y, { font: boldFont, size: companyNameFontSize, color: PROC_RED });

      // Draw company details (slightly smaller and lighter color)
      const detailsY = y - companyNameLineHeight;
      drawText(`RIF: ${request.companies?.rif || 'N/A'}`, logoX + logoWidth + 10, detailsY, { size: 9, color: DARK_GRAY });
      drawText(`Dirección: ${request.companies?.address || 'N/A'}`, logoX + logoWidth + 10, detailsY - lineHeight, { size: 9, color: DARK_GRAY });
      drawText(`Teléfono: ${request.companies?.phone || 'N/A'}`, logoX + logoWidth + 10, detailsY - lineHeight * 2, { size: 9, color: DARK_GRAY });
      drawText(`Email: ${request.companies?.email || 'N/A'}`, logoX + logoWidth + 10, detailsY - lineHeight * 3, { size: 9, color: DARK_GRAY });

      y -= logoHeight + lineHeight * 4;
    } else {
      // Fallback: Draw company name as text
      drawText(request.companies?.name || 'N/A', margin, y, { font: boldFont, size: companyNameFontSize, color: PROC_RED });
      y -= lineHeight * 2;
    }
    
    // Separator line (Red, 2pt)
    page.drawLine({
      start: { x: margin, y: y },
      end: { x: width - margin, y: y },
      thickness: 2,
      color: PROC_RED,
    });
    y -= lineHeight * 2;

    // Draw document title centered (Red and bold)
    drawText('SOLICITUD DE COTIZACIÓN', width / 2 - 100, y, { font: boldFont, size: 16, color: PROC_RED });
    y -= lineHeight * 2;
    drawText(`Nº: ${request.id.substring(0, 8)}`, width - margin - 100, y, { font: boldFont, size: 10 });
    drawText(`Fecha: ${new Date(request.created_at).toLocaleDateString('es-VE')}`, width - margin - 100, y - lineHeight);
    y -= lineHeight * 3;

    // --- Detalles del Proveedor ---
    drawText('DATOS DEL PROVEEDOR:', margin, y, { font: boldFont, size: 12, color: PROC_RED });
    page.drawLine({
      start: { x: margin, y: y - lineHeight + 2 },
      end: { x: width - margin, y: y - lineHeight + 2 },
      thickness: 0.5,
      color: LIGHT_GRAY,
    });
    y -= lineHeight;
    drawText(`Nombre: ${request.suppliers?.name || 'N/A'}`, margin, y);
    y -= lineHeight;
    drawText(`RIF: ${request.suppliers?.rif || 'N/A'}`, margin, y);
    y -= lineHeight * 2;

    // --- Tabla de Ítems Solicitados ---
    drawText('ÍTEMS SOLICITADOS:', margin, y, { font: boldFont, size: 12, color: PROC_RED });
    page.drawLine({
      start: { x: margin, y: y - lineHeight + 2 },
      end: { x: width - margin, y: y - lineHeight + 2 },
      thickness: 0.5,
      color: LIGHT_GRAY,
    });
    y -= lineHeight;
    
    drawTableHeader(); // Draw table header (already includes bottom border)

    // Dibujar filas de ítems
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      checkPageBreak(lineHeight); 

      let currentX = tableX;
      
      // Draw thin gray line above the row content (to separate rows)
      page.drawLine({
        start: { x: tableX, y: y },
        end: { x: tableX + tableWidth, y: y },
        thickness: 0.5,
        color: LIGHT_GRAY,
      });

      // Draw item data
      drawText(item.material_name, currentX + 5, y - lineHeight + (lineHeight - fontSize) / 2);
      currentX += colWidths[0];

      // Right-align numeric values
      const quantityText = item.quantity.toString();
      drawText(quantityText, currentX + colWidths[1] - 5 - font.widthOfTextAtSize(quantityText, fontSize), y - lineHeight + (lineHeight - fontSize) / 2);
      currentX += colWidths[1];

      const unitText = item.unit || 'N/A';
      drawText(unitText, currentX + colWidths[2] - 5 - font.widthOfTextAtSize(unitText, fontSize), y - lineHeight + (lineHeight - fontSize) / 2);
      currentX += colWidths[2];

      // Left-align description
      drawText(item.description || 'N/A', currentX + 5, y - lineHeight + (lineHeight - fontSize) / 2);

      y -= lineHeight;
    }
    
    // Draw final bottom border for the table
    page.drawLine({
      start: { x: tableX, y: y },
      end: { x: tableX + tableWidth, y: y },
      thickness: 1,
      color: LIGHT_GRAY,
    });
    
    y -= lineHeight * 2; 

    // --- Footer ---
    const footerY = margin; 
    drawText(`Generado por: ${request.created_by || user.email}`, margin, footerY + lineHeight * 2);

    const pdfBytes = await pdfDoc.save();

    // Format filename as: SC, "NOMBRE DEL PROVEEDOR" "FECHA ACTUAL"
    const supplierName = request.suppliers?.name || 'Proveedor';
    const currentDate = new Date().toLocaleDateString('es-VE').replace(/\//g, '-');
    const safeSupplierName = supplierName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    const filename = `SC_${safeSupplierName}_${currentDate}.pdf`;

    console.log(`[generate-qr-pdf] Generated PDF with filename: ${filename}`);

    const response = new Response(pdfBytes, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

    return response;

  } catch (error) {
    console.error('[generate-qr-pdf] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});