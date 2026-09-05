import PDFDocument from 'pdfkit';
import { getServerClient } from '@alphabot/database';
import { WhatsAppGateway } from '../whatsapp/gateway.js';
import type { WhatsAppProvider } from '@alphabot/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrderItem {
  name:     string;
  quantity: number;
  price:    number;
  sku?:     string;
}

export interface InvoiceInput {
  tenantId:      string;
  tenantName:    string;
  orderId:       string;
  orderTotal:    number;
  items:         OrderItem[];
  contactName:   string | null;
  contactPhone:  string;
  paymentStatus: string;
  paymentLink?:  string | null;
}

export interface InvoiceResult {
  invoiceId:     string;
  invoiceNumber: string;
  pdfUrl:        string;
}

const BUCKET = 'invoices';
const GST_RATE = 0.18;

// ── Bucket bootstrap ──────────────────────────────────────────────────────────

async function ensureBucket(db: ReturnType<typeof getServerClient>): Promise<void> {
  const { error } = await db.storage.createBucket(BUCKET, {
    public:           true,
    fileSizeLimit:    10 * 1024 * 1024, // 10 MB
    allowedMimeTypes: ['application/pdf'],
  });
  if (error && !error.message.toLowerCase().includes('already exist')) {
    console.warn('[Invoice] Bucket init:', error.message);
  }
}

// ── Invoice number ─────────────────────────────────────────────────────────────

async function nextInvoiceNumber(db: ReturnType<typeof getServerClient>, tenantId: string): Promise<string> {
  const { count } = await db
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  const seq = String((count ?? 0) + 1).padStart(4, '0');
  const ym  = new Date().toISOString().slice(0, 7).replace('-', ''); // e.g. "202609"
  return `INV-${ym}-${seq}`;
}

// ── PDF generation ─────────────────────────────────────────────────────────────

function generatePDF(input: InvoiceInput, invoiceNumber: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data',  (c: Buffer) => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - 100; // usable width (margins = 50 each side)

    // ── Header ────────────────────────────────────────────────────────────────
    doc.fontSize(22).font('Helvetica-Bold').text(input.tenantName, 50, 50);
    doc.fontSize(10).font('Helvetica').fillColor('#6B7280').text('Tax Invoice', 50, 80);

    doc.fontSize(18).font('Helvetica-Bold').fillColor('#111827')
       .text('INVOICE', 400, 50, { align: 'right', width: W - 350 });
    doc.fontSize(10).font('Helvetica').fillColor('#374151')
       .text(invoiceNumber, 400, 76, { align: 'right', width: W - 350 });

    const dateStr = new Date().toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
    });
    doc.text(`Date: ${dateStr}`, 400, 92, { align: 'right', width: W - 350 });

    // ── Divider ───────────────────────────────────────────────────────────────
    doc.moveTo(50, 115).lineTo(545, 115).strokeColor('#E5E7EB').lineWidth(1).stroke();

    // ── Bill To ───────────────────────────────────────────────────────────────
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#9CA3AF').text('BILL TO', 50, 130);
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#111827')
       .text(input.contactName ?? 'Customer', 50, 145);
    doc.fontSize(10).font('Helvetica').fillColor('#374151').text(input.contactPhone, 50, 160);

    // ── Items table ───────────────────────────────────────────────────────────
    const tableTop = 200;
    const cols     = { item: 50, qty: 300, unitPrice: 370, amount: 460 };

    // Header row
    doc.rect(50, tableTop, W, 22).fill('#F3F4F6');
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151');
    doc.text('ITEM',       cols.item,      tableTop + 7);
    doc.text('QTY',        cols.qty,       tableTop + 7, { width: 60, align: 'right' });
    doc.text('UNIT PRICE', cols.unitPrice, tableTop + 7, { width: 70, align: 'right' });
    doc.text('AMOUNT',     cols.amount,    tableTop + 7, { width: 85, align: 'right' });

    // Item rows
    let y = tableTop + 30;
    doc.font('Helvetica').fillColor('#111827');

    for (const item of input.items) {
      const amount = item.quantity * item.price;
      doc.fontSize(10).text(item.name, cols.item, y, { width: 230 });
      doc.text(String(item.quantity),                cols.qty,       y, { width: 60,  align: 'right' });
      doc.text(`₹${item.price.toLocaleString('en-IN')}`, cols.unitPrice, y, { width: 70,  align: 'right' });
      doc.text(`₹${amount.toLocaleString('en-IN')}`,     cols.amount,    y, { width: 85,  align: 'right' });

      y += 22;
      doc.moveTo(50, y - 4).lineTo(545, y - 4).strokeColor('#F3F4F6').lineWidth(0.5).stroke();
    }

    // ── Totals ────────────────────────────────────────────────────────────────
    const subtotal = input.items.reduce((s, i) => s + i.quantity * i.price, 0);
    const gstAmt   = subtotal * GST_RATE;
    const total    = subtotal + gstAmt;

    y += 10;
    doc.moveTo(350, y).lineTo(545, y).strokeColor('#E5E7EB').lineWidth(1).stroke();
    y += 8;

    const totalColW = 100;
    const valX      = 545 - totalColW;

    const row = (label: string, value: string, bold = false) => {
      doc.fontSize(10)
         .font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .fillColor('#374151')
         .text(label, 350, y, { width: valX - 360 });
      doc.text(value, valX, y, { width: totalColW, align: 'right' });
      y += 18;
    };

    row('Subtotal',      `₹${subtotal.toLocaleString('en-IN')}`);
    row(`GST (${(GST_RATE * 100).toFixed(0)}%)`, `₹${gstAmt.toLocaleString('en-IN')}`);

    doc.moveTo(350, y).lineTo(545, y).strokeColor('#E5E7EB').lineWidth(1).stroke();
    y += 8;
    row('Total', `₹${total.toLocaleString('en-IN')}`, true);

    // ── Payment status banner ─────────────────────────────────────────────────
    y += 20;
    const isPaid = input.paymentStatus === 'paid';

    doc.rect(50, y, W, 30)
       .fill(isPaid ? '#D1FAE5' : '#FEF3C7');
    doc.fontSize(10).font('Helvetica-Bold')
       .fillColor(isPaid ? '#065F46' : '#92400E')
       .text(
         isPaid ? '✓ Payment Received' : '⚠ Payment Pending',
         55, y + 10,
       );

    if (!isPaid && input.paymentLink) {
      y += 40;
      doc.fontSize(9).font('Helvetica').fillColor('#374151')
         .text('Pay online:', 50, y);
      doc.fillColor('#2563EB').text(input.paymentLink, 50, y + 12, { link: input.paymentLink });
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const pageH = doc.page.height;
    doc.fontSize(8).font('Helvetica').fillColor('#9CA3AF')
       .text('Thank you for your business.', 50, pageH - 60, { align: 'center', width: W });
    doc.text('This is a computer-generated invoice.', 50, pageH - 48, { align: 'center', width: W });

    doc.end();
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateAndSendInvoice(input: InvoiceInput): Promise<InvoiceResult> {
  const db = getServerClient();

  await ensureBucket(db);

  const invoiceNumber = await nextInvoiceNumber(db, input.tenantId);
  const pdfBuffer     = await generatePDF(input, invoiceNumber);

  // Upload to Supabase Storage
  const path = `${input.tenantId}/${input.orderId}.pdf`;
  const { error: uploadErr } = await db.storage
    .from(BUCKET)
    .upload(path, pdfBuffer, {
      contentType: 'application/pdf',
      upsert:      true,
    });

  if (uploadErr) throw new Error(`Invoice upload failed: ${uploadErr.message}`);

  const { data: { publicUrl } } = db.storage.from(BUCKET).getPublicUrl(path);

  // Save invoice record
  const { data: invoice, error: dbErr } = await db
    .from('invoices')
    .insert({
      tenant_id:      input.tenantId,
      order_id:       input.orderId,
      invoice_number: invoiceNumber,
      pdf_url:        publicUrl,
      sent_at:        null,
    })
    .select('id')
    .single();

  if (dbErr || !invoice) throw new Error(`Failed to save invoice: ${dbErr?.message}`);

  // Send via WhatsApp
  const { data: wn } = await db
    .from('whatsapp_numbers')
    .select('config_json, provider')
    .eq('tenant_id', input.tenantId)
    .eq('product_slug', 'lifecycle_bot')
    .eq('active', true)
    .maybeSingle();

  if (wn) {
    const gateway  = new WhatsAppGateway((wn as { provider: string }).provider as WhatsAppProvider);
    const wnConfig = (wn as { config_json: { phone_number_id: string; access_token: string } }).config_json;

    await gateway.sendMessage(wnConfig.phone_number_id, wnConfig.access_token, {
      type:      'media',
      to:        input.contactPhone,
      mediaType: 'document',
      mediaUrl:  publicUrl,
      filename:  `${invoiceNumber}.pdf`,
      caption:   `📄 *Invoice ${invoiceNumber}*\n\nTotal: ₹${input.orderTotal.toLocaleString('en-IN')}\n\nThank you for your order!`,
    });

    await db
      .from('invoices')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', (invoice as { id: string }).id);
  }

  return {
    invoiceId:     (invoice as { id: string }).id,
    invoiceNumber,
    pdfUrl:        publicUrl,
  };
}
