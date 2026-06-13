-- ============================================================================
-- Elma Water Industries — Knowledge Base Seed
-- Run this in Supabase SQL Editor (Role: postgres) ONCE.
-- Creates a KB collection and inserts 50 Q&A entries for the support bot.
-- ============================================================================

DO $$
DECLARE
  v_tenant_id   uuid;
  v_collection  uuid;
BEGIN

  -- Find the Elma tenant
  SELECT id INTO v_tenant_id
  FROM tenants
  WHERE name ILIKE '%elma%'
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No tenant matching "elma" found. Create the tenant first.';
  END IF;

  -- Create (or reuse) a KB collection
  INSERT INTO kb_collections (tenant_id, name, description, active)
  VALUES (
    v_tenant_id,
    'Elma Support Knowledge Base',
    'Product specs, ordering process, delivery, pricing FAQs and customisation info for Elma Water Industries.',
    true
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_collection;

  -- If already existed, look it up
  IF v_collection IS NULL THEN
    SELECT id INTO v_collection
    FROM kb_collections
    WHERE tenant_id = v_tenant_id
      AND name = 'Elma Support Knowledge Base'
    LIMIT 1;
  END IF;

  -- Assign to support_bot
  INSERT INTO kb_collection_bots (collection_id, tenant_id, product_slug, priority)
  VALUES (v_collection, v_tenant_id, 'support_bot', 1)
  ON CONFLICT DO NOTHING;

  -- ================================================================
  -- INSERT KB ENTRIES
  -- ================================================================

  -- ── CATEGORY: About Us ──────────────────────────────────────────

  INSERT INTO knowledge_base (tenant_id, product_type, collection_id, question, answer, category, status)
  VALUES

  (v_tenant_id, 'support_bot', v_collection,
   'What is Elma Water Industries?',
   'Elma Water Industries is a Hyderabad-based manufacturer of premium custom-labelled PET water bottles. We supply restaurants, hotels, cafés, food brands, and event organisers across Hyderabad with branded water bottles — your logo, your design, printed on food-grade PET bottles in 500 ml, 750 ml, and 1000 ml sizes. We currently serve 45+ active business clients and deliver over 5,000 cases every month.',
   'About Us', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'Where is Elma located?',
   'Our manufacturing and dispatch facility is located in Cherlapally, Hyderabad, Telangana 500051. We are a local Hyderabad business — when you call or WhatsApp us, you speak to a real person, not a call centre.',
   'About Us', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'What are your business hours?',
   'We are open Monday to Saturday, 9:00 AM to 7:00 PM. For urgent queries, you can WhatsApp us at +91 63090 60777 and we will get back to you as soon as possible.',
   'About Us', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'How do I contact Elma?',
   'You can reach us in the following ways:
• WhatsApp / Call — Haneel (CRM): +91 63090 60777
• WhatsApp / Call — Sai Parinay (CRM): +91 96428 17777
• Email: admin@elmawaterindustries.in
We are available Monday to Saturday, 9 AM – 7 PM.',
   'About Us', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'How many clients does Elma have?',
   'We proudly serve 45+ active business clients across Hyderabad, including well-known restaurants, hotels, cafés, and event companies. Some of our clients include Biryanis and More, Tara South Indian Kitchen, Raj Darbar, Bratt Café, House Party Bar & Kitchen, Platform 65, and Jubilee Festa Inn.',
   'About Us', 'live'),

  -- ── CATEGORY: Products ──────────────────────────────────────────

  (v_tenant_id, 'support_bot', v_collection,
   'What bottle sizes do you offer?',
   'We currently offer three bottle sizes:
• 500 ml — ideal for cafés, quick-service restaurants, and compact events
• 750 ml — popular for bars, lounges, and premium dining
• 1000 ml (1 litre) — popular for family restaurants, hotels, and large gatherings
All sizes are available with full-colour custom labels.',
   'Products', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'What are your bottles made of?',
   'Our bottles are made from food-grade PET (Polyethylene Terephthalate). PET is a safe, recyclable, BPA-free plastic widely used in the packaged drinking water industry. Our bottles comply with food safety standards.',
   'Products', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'Are your bottles food-safe?',
   'Yes, absolutely. All our bottles are made from food-grade PET plastic, and our custom labels use food-safe inks and adhesives. Your customers can safely use our bottles without any concern.',
   'Products', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'Can I get bottles with my own brand / logo on them?',
   'Yes — that is exactly what we specialise in! Every bottle we supply comes with your custom-designed label featuring your logo, brand colours, and any text you want. We print crisp, vibrant, full-colour labels that match your design precisely. We also offer label design support if you do not have an existing design.',
   'Products', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'Can I order different bottle sizes in the same order?',
   'Yes, you can mix bottle sizes within the same order. For example, you could order 500 ml and 1000 ml bottles together, each with your custom label. Let us know your requirements when placing your order.',
   'Products', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'What do the labels look like?',
   'Our labels are full-colour, high-resolution, and printed on premium food-safe material. The print is sharp and vibrant — not a blurry or low-quality approximation. Many of our clients say their branded bottles become a talking point with their own customers. We send you a label proof for your approval before printing begins.',
   'Products', 'live'),

  -- ── CATEGORY: B2B / Bulk Orders ─────────────────────────────────

  (v_tenant_id, 'support_bot', v_collection,
   'Who is the bulk B2B order option for?',
   'Our bulk B2B service is designed for restaurants, hotels, cafés, caterers, cloud kitchens, food brands, and any business that needs branded water bottles on a regular basis. If you go through more than a few cases per month, bulk ordering is the right fit for you.',
   'B2B Orders', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'What is the minimum order quantity for bulk orders?',
   'For exact minimum order quantities, please WhatsApp us at +91 63090 60777. We are flexible and work with businesses of different sizes — from small cafés to large restaurant chains. Our team will help you find the right quantity for your needs.',
   'B2B Orders', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'Can I set up a recurring monthly order?',
   'Yes — recurring monthly orders are one of our specialities. Many of our 45+ clients place a standing order every month and we deliver automatically on a fixed schedule. This ensures you never run out of stock. You can adjust quantities for any given month with advance notice.',
   'B2B Orders', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'Do I get a dedicated account manager?',
   'Yes. Every B2B client gets dedicated account management. Your account manager is your single point of contact for orders, reorders, label changes, and any issues. You can reach them directly on WhatsApp for fast responses.',
   'B2B Orders', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'Can Elma help me design my label?',
   'Yes! If you have a logo or brand assets, we will design the label for you. If you do not have an existing design, our team will help you create one. Label design support is included with your order. Simply share your logo, preferred colours, and any text, and we will create a proof for your approval.',
   'B2B Orders', 'live'),

  -- ── CATEGORY: Events & Individual Orders ─────────────────────────

  (v_tenant_id, 'support_bot', v_collection,
   'Can I order custom bottles for my wedding?',
   'Absolutely! Personalised wedding water bottles are one of our most popular products. You can have your names, wedding date, and a custom design printed on the bottles — a beautiful keepsake for your guests. We offer low minimum order quantities for individual and event orders. WhatsApp us at +91 63090 60777 to get started.',
   'Events & Individual', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'Can I order bottles for a corporate event or gifting?',
   'Yes. We supply custom-labelled bottles for corporate events, conferences, product launches, and gifting. Your company logo, event name, or a personalised message can be printed on the bottles. Contact us on WhatsApp with your event date and quantity for a quick quote.',
   'Events & Individual', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'What is the minimum order for events or personal orders?',
   'We keep minimum quantities low for event and individual orders so that even smaller occasions can have personalised bottles. Please WhatsApp us with your event type and required quantity and we will confirm if we can accommodate you.',
   'Events & Individual', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'I need bottles for an event next week. Is that possible?',
   'Our average turnaround time is 48 hours after order confirmation and label approval. For urgent event orders, contact us immediately on WhatsApp at +91 63090 60777 — we will do our best to meet your deadline. The sooner you reach out, the better we can plan.',
   'Events & Individual', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'Can I order bottles for a birthday party?',
   'Yes! Custom birthday party water bottles are a great personal touch. You can add the celebrant''s name, photo, age, and event date to the label. We handle the design and printing — you just need to share your requirements. WhatsApp us at +91 63090 60777.',
   'Events & Individual', 'live'),

  -- ── CATEGORY: Pricing & Quotes ──────────────────────────────────

  (v_tenant_id, 'support_bot', v_collection,
   'How much do your bottles cost? What is the price?',
   'Our pricing depends on bottle size, quantity, and label design complexity. We offer competitive rates and volume-based pricing — the more you order, the better the rate. To get an accurate quote tailored to your requirements, please WhatsApp us at +91 63090 60777 with your bottle size, quantity needed, and order frequency. Our team will send you a quote promptly.',
   'Pricing', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'Do you offer discounts for large or recurring orders?',
   'Yes, we offer volume discounts for larger orders and better rates for recurring monthly clients. The exact discount depends on quantity and order frequency. Please share your requirements on WhatsApp at +91 63090 60777 and we will offer you our best pricing.',
   'Pricing', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'How do I get a price quote?',
   'Getting a quote is simple. WhatsApp us at +91 63090 60777 with the following details:
1. Bottle size (500 ml / 750 ml / 1000 ml)
2. Approximate quantity (per month or one-time)
3. Whether you have an existing design or need us to create one
We will send you a quote within a few hours.',
   'Pricing', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'Is there a setup fee or design fee?',
   'Label design support is included with your order — there is no separate design fee for standard labels. For any unusual or highly complex design work, our team will advise you at the time of quote. Please WhatsApp us to discuss your specific requirements.',
   'Pricing', 'live'),

  -- ── CATEGORY: Ordering Process ──────────────────────────────────

  (v_tenant_id, 'support_bot', v_collection,
   'How do I place an order with Elma?',
   'Ordering from us is a 4-step process:
1. WhatsApp us at +91 63090 60777 with your requirements (quantity, bottle size, timeline)
2. Share your logo or brand assets — or ask us to design a label for you
3. We send you a label proof — you review and approve it
4. Once approved, we process your order and deliver to your door
Most orders are ready within 48 hours of confirmation.',
   'Ordering', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'What information do I need to provide when placing an order?',
   'To process your order we need:
• Business name and delivery address
• Bottle size preference (500 ml, 750 ml, or 1000 ml)
• Quantity required
• Your logo / brand assets (or a description if you need us to design)
• Your timeline / required delivery date
• Contact number for delivery coordination
You can share all this over WhatsApp at +91 63090 60777.',
   'Ordering', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'How do I pay for my order?',
   'Payment details are confirmed when you place your order with our team. Please WhatsApp us at +91 63090 60777 to discuss payment options for your specific order.',
   'Ordering', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'Can I place my order online?',
   'Currently we process all orders via WhatsApp for a personalised experience. This allows us to understand your exact requirements, help with label design, and confirm details before production. WhatsApp us at +91 63090 60777 to get started.',
   'Ordering', 'live'),

  -- ── CATEGORY: Delivery ──────────────────────────────────────────

  (v_tenant_id, 'support_bot', v_collection,
   'Which areas do you deliver to?',
   'We deliver across Hyderabad including Gachibowli, Jubilee Hills, Madhapur, Banjara Hills, Secunderabad, and all surrounding areas. If you are based in Hyderabad, we can deliver to you. For locations outside Hyderabad, please contact us to check availability.',
   'Delivery', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'How long does delivery take?',
   'Our average turnaround time is 48 hours from order confirmation and label approval. For recurring clients on a scheduled delivery plan, your bottles arrive on your agreed delivery day every month without you needing to reorder each time.',
   'Delivery', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'Is delivery reliable? Will you deliver on time?',
   'Reliability is one of our core promises. We have 45+ clients across Hyderabad who rely on us for monthly deliveries — and we have maintained a strong track record of on-time supply. We are based locally in Cherlapally so we can respond quickly to any issues.',
   'Delivery', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'What if my delivery is delayed or there is a supply issue?',
   'If there is ever an issue with your delivery, your dedicated account manager will contact you proactively to resolve it. We prioritise same-day resolution of supply problems. You can also reach us directly at +91 63090 60777 for urgent delivery concerns.',
   'Delivery', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'Do you deliver outside Hyderabad?',
   'Our primary service area is Hyderabad and surrounding areas. For deliveries outside Hyderabad, please WhatsApp us at +91 63090 60777 to check if we can accommodate your location and discuss logistics.',
   'Delivery', 'live'),

  -- ── CATEGORY: Customisation & Design ────────────────────────────

  (v_tenant_id, 'support_bot', v_collection,
   'I do not have a logo or design. Can you still help?',
   'Yes! If you do not have an existing logo or label design, our team will help you create one based on your brief. Simply tell us your business name, preferred colours, the feel you are going for, and any text you want on the label — and we will design it for you. Label design support is included at no extra charge.',
   'Customisation', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'What file format should I send my logo in?',
   'For the best print quality, please share your logo in a high-resolution format such as:
• AI (Adobe Illustrator) — preferred
• EPS or PDF (vector formats)
• PNG with transparent background (minimum 300 DPI)
If you only have a JPEG or low-resolution file, share it and our team will advise you on quality. We always send a label proof before printing so you can confirm how it looks.',
   'Customisation', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'Can I see a proof of my label before printing?',
   'Yes — we always send you a label proof for your approval before we begin production. No bottles are printed until you have confirmed that the design looks exactly right. This ensures there are no surprises.',
   'Customisation', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'What information can I put on my label?',
   'You can include almost anything on your label, for example:
• Business name and logo
• Tagline or brand message
• Contact details (phone, website, social media)
• QR code
• Nutritional or water source information
• Event name and date (for event bottles)
• Any legal or regulatory text required for your business
Our team will guide you through the label layout during the design process.',
   'Customisation', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'Can I change my label design after I have placed an order?',
   'Label changes can be accommodated before production begins. Once you have approved the proof and production is underway, changes may not be possible for that batch. If you need to change your design for a future order, simply contact your account manager well in advance.',
   'Customisation', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'Can I have different labels on different bottle sizes?',
   'Yes. If you order multiple bottle sizes, each size can have a slightly different label layout to suit the dimensions of that bottle. Your core branding will remain consistent across all sizes.',
   'Customisation', 'live'),

  -- ── CATEGORY: Existing Clients / Reorders ───────────────────────

  (v_tenant_id, 'support_bot', v_collection,
   'I am an existing client. How do I reorder?',
   'Reordering is easy. WhatsApp your account manager directly or message us at +91 63090 60777 with your business name and the quantity you need. If your label design has not changed, we can process your reorder straight away. No need to go through the full onboarding process again.',
   'Reorders', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'I want to change my label design for my next order. What do I do?',
   'Contact your account manager on WhatsApp and share your updated logo or design assets. We will create a new proof for your approval. Please initiate the design change at least a few days before your next order date to allow time for proofing and production.',
   'Reorders', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'I need to increase my monthly quantity. What should I do?',
   'Simply WhatsApp your account manager at +91 63090 60777 with your new required quantity and the date from which you need the increase. We will update your recurring order accordingly. We recommend notifying us at least 5–7 days in advance of your delivery date.',
   'Reorders', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'I need to pause or skip my monthly order. Is that possible?',
   'Yes — just WhatsApp your account manager in advance to let us know you want to skip or pause a delivery. We ask for as much notice as possible (ideally at least 5 days before your scheduled delivery date) so we can plan production accordingly.',
   'Reorders', 'live'),

  -- ── CATEGORY: Quality & FAQs ────────────────────────────────────

  (v_tenant_id, 'support_bot', v_collection,
   'What is the quality of your water bottles?',
   'Our bottles are manufactured from food-grade PET, meeting standard industry quality for packaged drinking water. Our custom labels use food-safe inks. We have maintained a 5-star rating across 45+ clients, many of whom describe our quality as genuinely better than previous suppliers they have used.',
   'Quality & FAQs', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'Do your bottles have ISI or BIS certification?',
   'For specific certification queries, please contact our team directly on WhatsApp at +91 63090 60777 or email admin@elmawaterindustries.in. Our team will provide the relevant documentation for your requirements.',
   'Quality & FAQs', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'What happens if I receive a damaged or defective batch?',
   'Your satisfaction is our priority. If you receive damaged or defective bottles, contact your account manager immediately on WhatsApp. We will investigate and arrange a replacement or resolution as quickly as possible. We stand behind the quality of everything we deliver.',
   'Quality & FAQs', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'How are the bottles packaged for delivery?',
   'Bottles are packed securely in cases for delivery. If you have specific packaging requirements (e.g., for a retail display or event setup), let us know when placing your order.',
   'Quality & FAQs', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'Can I visit your facility?',
   'You are welcome to visit our facility in Cherlapally, Hyderabad. Please WhatsApp us at +91 63090 60777 in advance to schedule a visit so we can ensure someone is available to meet you.',
   'Quality & FAQs', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'Do you supply water in the bottles or just the empty bottles?',
   'We supply custom-labelled filled PET water bottles — not empty bottles. The water is filled, sealed, and labelled with your brand design before delivery. If you have specific water source or quality requirements, please discuss this with our team.',
   'Quality & FAQs', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'How does Elma compare to generic/unbranded water bottle suppliers?',
   'Unlike generic suppliers, Elma offers full custom branding on every bottle — your logo, your colours, your design. Branded bottles elevate your business image, create a premium guest experience, and make your brand visible every time a customer picks up a bottle. We also offer dedicated account management, reliable recurring delivery, and local accountability — you can always reach a real person when you need help.',
   'Quality & FAQs', 'live'),

  (v_tenant_id, 'support_bot', v_collection,
   'I saw Elma''s website but I have a specific question not answered there. Who do I contact?',
   'For any question not covered on our website, please WhatsApp us directly at +91 63090 60777 — Haneel or Sai Parinay from our CRM team will assist you. You can also email us at admin@elmawaterindustries.in. We aim to respond to all queries within a few hours during business hours (Mon–Sat, 9 AM – 7 PM).',
   'Quality & FAQs', 'live');

  -- ================================================================
  -- Update / insert bot_config with a tailored system prompt
  -- ================================================================

  INSERT INTO bot_configs (tenant_id, product_slug, system_prompt, confidence_threshold, escalation_triggers)
  VALUES (
    v_tenant_id,
    'support_bot',
    'You are a friendly and helpful WhatsApp support assistant for Elma Water Industries — a Hyderabad-based supplier of custom-labelled PET water bottles. Your job is to help customers with questions about our products, ordering process, pricing, delivery, and customisation.

Key facts to know:
• We supply custom-branded PET water bottles in 500 ml, 750 ml, and 1000 ml sizes
• We serve restaurants, hotels, cafés, event organisers, and corporate clients across Hyderabad
• Pricing is provided on request via WhatsApp (+91 63090 60777) — do not quote specific prices
• Average delivery turnaround is 48 hours after order confirmation and label approval
• We are based in Cherlapally, Hyderabad — open Mon–Sat, 9 AM – 7 PM
• Label design support is included; customers can share their logo or we will design for them

Guidelines:
1. Always be warm, helpful, and to the point — customers are messaging on WhatsApp
2. For pricing, volume discounts, or specific quotes, tell the customer to WhatsApp +91 63090 60777 or email admin@elmawaterindustries.in
3. Use the knowledge base to answer questions accurately
4. If you cannot confidently answer a question, offer to escalate to a human team member
5. Never make up prices, delivery dates, or product specs not confirmed in the knowledge base
6. Keep responses concise — this is WhatsApp, not email',
    0.55,
    ARRAY['complaint', 'refund', 'damaged', 'defective', 'wrong order', 'not delivered', 'cancel order', 'speak to someone', 'human', 'manager']
  )
  ON CONFLICT (tenant_id, product_slug) DO UPDATE
    SET system_prompt         = EXCLUDED.system_prompt,
        confidence_threshold  = EXCLUDED.confidence_threshold,
        escalation_triggers   = EXCLUDED.escalation_triggers,
        updated_at            = now();

  RAISE NOTICE 'Elma KB seed complete. Collection ID: %', v_collection;

END $$;
