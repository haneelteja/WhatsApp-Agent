'use server';

import PDFDocument                from 'pdfkit';
import { getSession }             from '@/lib/session';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { revalidatePath }         from 'next/cache';

// ── PDF generation ─────────────────────────────────────────────────────────────

interface OrderItem { name: string; quantity: number; price: number }

function buildPDF(
  tenantName:    string,
  invoiceNumber: string,
  contactName:   string | null,
  contactPhone:  string,
  items:         OrderItem[],
  orderTotal:    number,
  paymentStatus: string,
  paymentLink:   string | null,
): Promise<Buffer> {
  const GST_RATE = 0.18;

  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data',  (c: Buffer) => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - 100;

    // Header
    doc.fontSize(22).font('Helvetica-Bold').fillColor('#111827').text(tenantName, 50, 50);
    doc.fontSize(10).font('Helvetica').fillColor('#6B7280').text('Tax Invoice', 50, 80);
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#111827')
       .text('INVOICE', 400, 50, { align: 'right', width: W - 350 });
    doc.fontSize(10).font('Helvetica').fillColor('#374151')
       .text(invoiceNumber, 400, 76, { align: 'right', width: W - 350 });
    const dateStr = new Date().toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
    });
    doc.text(`Date: ${dateStr}`, 400, 92, { align: 'right', width: W - 350 });

    // Divider
    doc.moveTo(50, 115).lineTo(545, 115).strokeColor('#E5E7EB').lineWidth(1).stroke();

    // Bill To
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#9CA3AF').text('BILL TO', 50, 130);
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#111827').text(contactName ?? 'Customer', 50, 145);
    doc.fontSize(10).font('Helvetica').fillColor('#374151').text(contactPhone, 50, 160);

    // Items table
    const tableTop = 200;
    const cols     = { item: 50, qty: 300, unitPrice: 370, amount: 460 };

    doc.rect(50, tableTop, W, 22).fill('#F3F4F6');
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151');
    doc.text('ITEM',       cols.item,      tableTop + 7);
    doc.text('QTY',        cols.qty,       tableTop + 7, { width: 60,  align: 'right' });
    doc.text('UNIT PRICE', cols.unitPrice, tableTop + 7, { width: 70,  align: 'right' });
    doc.text('AMOUNT',     cols.amount,    tableTop + 7, { width: 85,  align: 'right' });

    let y = tableTop + 30;
    doc.font('Helvetica').fillColor('#111827');
    for (const item of items) {
      const amount = item.quantity * item.price;
      doc.fontSize(10).text(item.name, cols.item, y, { width: 230 });
      doc.text(String(item.quantity),                    cols.qty,       y, { width: 60,  align: 'right' });
      doc.text(`₹${item.price.toLocaleString('en-IN')}`, cols.unitPrice, y, { width: 70,  align: 'right' });
      doc.text(`₹${amount.toLocaleString('en-IN')}`,     cols.amount,    y, { width: 85,  align: 'right' });
      y += 22;
      doc.moveTo(50, y - 4).lineTo(545, y - 4).strokeColor('#F3F4F6').lineWidth(0.5).stroke();
    }

    // Totals
    const subtotal = items.reduce((s, i) => s + i.quantity * i.price, 0);
    const gstAmt   = subtotal * GST_RATE;
    const total    = subtotal + gstAmt;
    y += 10;
    doc.moveTo(350, y).lineTo(545, y).strokeColor('#E5E7EB').lineWidth(1).stroke();
    y += 8;

    const addRow = (label: string, value: string, bold = false) => {
      doc.fontSize(10).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor('#374151')
         .text(label, 350, y, { width: 100 });
      doc.text(value, 445, y, { width: 100, align: 'right' });
      y += 18;
    };
    addRow('Subtotal', `₹${subtotal.toLocaleString('en-IN')}`);
    addRow(`GST (${(GST_RATE * 100).toFixed(0)}%)`, `₹${gstAmt.toLocaleString('en-IN')}`);
    doc.moveTo(350, y).lineTo(545, y).strokeColor('#E5E7EB').lineWidth(1).stroke();
    y += 8;
    addRow('Total', `₹${total.toLocaleString('en-IN')}`, true);

    // Payment status banner
    y += 20;
    const isPaid = paymentStatus === 'paid';
    doc.rect(50, y, W, 30).fill(isPaid ? '#D1FAE5' : '#FEF3C7');
    doc.fontSize(10).font('Helvetica-Bold').fillColor(isPaid ? '#065F46' : '#92400E')
       .text(isPaid ? '✓ Payment Received' : '⚠ Payment Pending', 60, y + 10);
    if (!isPaid && paymentLink) {
      y += 40;
      doc.fontSize(9).font('Helvetica').fillColor('#374151').text('Pay online: ', 50, y);
      doc.fillColor('#2563EB').text(paymentLink, 50, y + 12, { link: paymentLink });
    }

    // Footer
    const pageH = doc.page.height;
    doc.fontSize(8).font('Helvetica').fillColor('#9CA3AF')
       .text('Thank you for your business.', 50, pageH - 60, { align: 'center', width: W });
    doc.text('This is a computer-generated invoice.', 50, pageH - 48, { align: 'center', width: W });

    void orderTotal; // used by caller for caption
    doc.end();
  });
}

// ── Server action ─────────────────────────────────────────────────────────────

export async function generateInvoiceAction(
  orderId: string,
): Promise<{ invoiceNumber?: string; pdfUrl?: string; error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();

  // Fetch order data
  const { data: order } = await admin
    .from('orders')
    .select(`
      id, total, items_json, status,
      tenant:tenants(name),
      contact:contacts(phone, name),
      payments(status, link_url)
    `)
    .eq('id', orderId)
    .eq('tenant_id', session.tenantId)
    .single();

  if (!order) return { error: 'Order not found' };

  const contact   = (order as unknown as { contact: { phone: string; name: string | null } }).contact;
  const tenant    = (order as unknown as { tenant: { name: string } }).tenant;
  const payment   = (order as unknown as { payments: Array<{ status: string; link_url: string | null }> }).payments?.[0];
  const items     = ((order as unknown as { items_json: OrderItem[] }).items_json) ?? [];
  const orderTotal = Number((order as unknown as { total: number }).total);

  if (!contact?.phone) return { error: 'No customer phone number on this order' };

  // Auto-assign invoice number
  const { count } = await admin
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', session.tenantId);

  const seq           = String((count ?? 0) + 1).padStart(4, '0');
  const ym            = new Date().toISOString().slice(0, 7).replace('-', '');
  const invoiceNumber = `INV-${ym}-${seq}`;

  // Generate PDF
  const pdfBuffer = await buildPDF(
    tenant?.name ?? 'Business',
    invoiceNumber,
    contact.name,
    contact.phone,
    items,
    orderTotal,
    payment?.status ?? 'pending',
    payment?.link_url ?? null,
  );

  // Upload to Supabase Storage
  const BUCKET = 'invoices';
  const path   = `${session.tenantId}/${orderId}.pdf`;

  await admin.storage.createBucket(BUCKET, {
    public:           true,
    fileSizeLimit:    10 * 1024 * 1024,
    allowedMimeTypes: ['application/pdf'],
  }).catch(() => { /* bucket may already exist */ });

  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: true });

  if (uploadErr) return { error: `Upload failed: ${uploadErr.message}` };

  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path);

  // Save invoice record
  const { data: invoice, error: dbErr } = await admin
    .from('invoices')
    .insert({
      tenant_id:      session.tenantId,
      order_id:       orderId,
      invoice_number: invoiceNumber,
      pdf_url:        publicUrl,
    })
    .select('id')
    .single();

  if (dbErr || !invoice) return { error: `DB error: ${dbErr?.message}` };

  // Send WhatsApp document message (Meta Cloud API)
  const { data: wn } = await admin
    .from('whatsapp_numbers')
    .select('config_json, provider')
    .eq('tenant_id', session.tenantId)
    .eq('product_slug', 'lifecycle_bot')
    .eq('active', true)
    .maybeSingle();

  if (wn && (wn as { provider: string }).provider === 'meta_cloud') {
    const cfg = (wn as { config_json: { phone_number_id: string; access_token: string } }).config_json;
    await fetch(`https://graph.facebook.com/v22.0/${cfg.phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to:                contact.phone.replace(/\s+/g, ''),
        type:              'document',
        document: {
          link:     publicUrl,
          filename: `${invoiceNumber}.pdf`,
          caption:  `📄 *Invoice ${invoiceNumber}*\n\nTotal: ₹${orderTotal.toLocaleString('en-IN')}\n\nThank you for your order!`,
        },
      }),
    }).catch(err => console.error('[Invoice] WhatsApp send failed:', err));

    await admin.from('invoices').update({ sent_at: new Date().toISOString() })
      .eq('id', (invoice as { id: string }).id);
  }

  revalidatePath('/orders');
  return { invoiceNumber, pdfUrl: publicUrl };
}
