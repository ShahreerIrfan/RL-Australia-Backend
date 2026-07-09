const { Client } = require('pg');

const client = new Client({
  connectionString: "postgresql://postgres:RlAustralia@187.127.141.36:5436/rlaustralia-rlaustralia",
  ssl: false
});

const categories = [
  { name: "Peptides", slug: "peptides", description: "Premium grade injectable, oral and topical research peptides." },
  { name: "Nootropics", slug: "nootropics", description: "Cognitive enhancers, memory improvement and focus compounds." },
  { name: "Supplements", slug: "supplements", description: "All-natural extracts, amino acids and daily health supplements." },
  { name: "Gummies", slug: "gummies", description: "Tasty, nutrient-packed gummies for health, performance and recovery." },
  { name: "Add-ons", slug: "add-ons", description: "Essential laboratory materials, accessories and secondary wellness items." }
];

const products = [
  // Peptides
  {
    name: "BPC-157",
    slug: "bpc-157-5mg-vial",
    short_description: "Premium BPC-157 peptide for regenerative research.",
    description: "BPC-157 (Body Protection Compound-157) is a pentadecapeptide composed of 15 amino acids. It is a sequence of a protective protein discovered in and isolated from human gastric juice. Research shows it promotes accelerated tissue healing, tendon-to-bone repair, and gut health support.",
    dosage: "5mg Vial",
    purity: "99.8%+",
    molecular_weight: "1419.5 g/mol",
    molecular_formula: "C62H98N16O22",
    price: 49.95,
    original_price: 64.95,
    discount_percent: 23,
    image_url: "/assets/products/bpc-157.png",
    sku: "BPC157-5MG",
    stock_quantity: 150,
    category_slug: "peptides",
    variants: [
      { title: "Single Vial", price: 49.95, original_price: 64.95, sku: "BPC157-1VIAL", stock_quantity: 100, weight: "5 Gram" },
      { title: "5-Pack", price: 199.95, original_price: 249.95, sku: "BPC157-5PACK", stock_quantity: 50, weight: "25 Gram" }
    ]
  },
  {
    name: "TB-500 (Thymosin Beta)",
    slug: "tb-500-5mg-vial",
    short_description: "High-grade TB-500 peptide for cellular repair research.",
    description: "TB-500 is a synthetic version of the active region of thymosin beta-4, a naturally occurring peptide found in virtually all human and animal cells. It promotes wound healing, muscle recovery, flexibility, and anti-inflammatory pathways.",
    dosage: "5mg Vial",
    purity: "99.5%+",
    molecular_weight: "4963.5 g/mol",
    molecular_formula: "C212H350N56O78S",
    price: 54.95,
    original_price: 69.95,
    discount_percent: 21,
    image_url: "/assets/products/asset 7.png",
    sku: "TB500-5MG",
    stock_quantity: 120,
    category_slug: "peptides"
  },
  {
    name: "GHK-Cu (Copper Peptide)",
    slug: "ghk-cu-50mg-vial",
    short_description: "Top-tier GHK-Cu copper peptide for anti-aging and tissue remodeling.",
    description: "GHK-Cu is a copper-binding tripeptide (glycyl-L-histidyl-L-lysine) naturally occurring in human plasma. It has strong tissue-remodeling properties, encourages collagen synthesis, boosts skin elasticity, and supports vascularization.",
    dosage: "50mg Vial",
    purity: "99.2%+",
    molecular_weight: "340.38 g/mol",
    molecular_formula: "C14H24CuN6O4",
    price: 69.95,
    original_price: 89.95,
    discount_percent: 22,
    image_url: "/assets/products/asset 10.png",
    sku: "GHKCU-50MG",
    stock_quantity: 85,
    category_slug: "peptides"
  },
  {
    name: "CJC-1295 (No DAC)",
    slug: "cjc-1295-2mg-vial",
    short_description: "Premium growth hormone secretagogue research peptide.",
    description: "CJC-1295 without DAC is a synthetic growth hormone releasing hormone analog that stimulates growth hormone secretion. It has a shorter half-life without the Drug Affinity Complex (DAC), allowing for pulsing release behavior during research.",
    dosage: "2mg Vial",
    purity: "99.0%+",
    molecular_weight: "3367.97 g/mol",
    molecular_formula: "C152H252N44O42",
    price: 44.95,
    original_price: 59.95,
    discount_percent: 25,
    image_url: "/assets/products/asset 8.png",
    sku: "CJC1295-2MG",
    stock_quantity: 200,
    category_slug: "peptides",
    variants: [
      { title: "Single Vial", price: 44.95, original_price: 59.95, sku: "CJC1295-2MG", stock_quantity: 200, weight: "5 Gram" },
      { title: "Double Vial", price: 80.00, original_price: 70.00, sku: "CJC1295-2MH", stock_quantity: 100, weight: "10 Gram" }
    ]
  },
  // Nootropics
  {
    name: "Semax (1%)",
    slug: "semax-1-percent",
    short_description: "High potency nasal spray for mental clarity and neuroprotection.",
    description: "Semax is a synthetic peptide drug developed in Russia, based on the ACTH(4-10) heptapeptide. It has strong neuroprotective, cognitive enhancing, and memory support properties.",
    dosage: "Nasal Spray · 3ml",
    purity: "99.7%+",
    molecular_weight: "812.9 g/mol",
    molecular_formula: "C39H56N10O10S",
    price: 59.95,
    original_price: 74.95,
    discount_percent: 20,
    image_url: "/assets/products/asset 9.png",
    sku: "SEMAX-1PCT",
    stock_quantity: 90,
    category_slug: "nootropics"
  },
  {
    name: "Selank (0.15%)",
    slug: "selank-nasal-spray",
    short_description: "Nasal spray peptide for anxiety reduction and emotional balance.",
    description: "Selank is a synthetic peptide heptapeptide analog of the immunomodulatory peptide tuftsin. It displays anxiolytic, cognitive enhancing, and immunostimulant effects in clinical research.",
    dosage: "Nasal Spray · 5ml",
    purity: "99.6%+",
    molecular_weight: "751.9 g/mol",
    molecular_formula: "C33H57N11O9",
    price: 64.95,
    original_price: 79.95,
    discount_percent: 18,
    image_url: "/assets/products/asset 6.png",
    sku: "SELANK-015",
    stock_quantity: 110,
    category_slug: "nootropics"
  },
  // Supplements
  {
    name: "Tongkat Ali",
    slug: "tongkat-ali-200mg",
    short_description: "Traditional herbal supplement for male vitality and energy support.",
    description: "Eurycoma longifolia (commonly known as Tongkat Ali) is a therapeutic herb native to Southeast Asia. This highly concentrated 200:1 extract supports natural testosterone production, muscle growth, and energy levels.",
    dosage: "200:1 Extract · 60 Capsules",
    purity: "Natural Extract",
    molecular_weight: "N/A",
    molecular_formula: "N/A",
    price: 29.99,
    original_price: 39.99,
    discount_percent: 25,
    image_url: "/assets/products/asset 7.png",
    sku: "TONGKAT-200MG",
    stock_quantity: 350,
    category_slug: "supplements"
  },
  {
    name: "Ashwagandha KSM-66",
    slug: "ashwagandha-ksm66",
    short_description: "Organic KSM-66 extract capsules for stress relief and cortisol balance.",
    description: "Ashwagandha (Withania somnifera) is a premier adaptogenic herb in Ayurvedic medicine. KSM-66 is the highest concentration full-spectrum root extract available, clinically proven to reduce stress, anxiety, and support strength training.",
    dosage: "600mg · 90 Capsules",
    purity: "KSM-66 Extract",
    molecular_weight: "N/A",
    molecular_formula: "N/A",
    price: 24.99,
    original_price: 34.99,
    discount_percent: 28,
    image_url: "/assets/products/asset 8.png",
    sku: "ASHWA-KSM66",
    stock_quantity: 400,
    category_slug: "supplements"
  },
  {
    name: "CoQ10",
    slug: "coq10",
    short_description: "High-absorption softgels for cellular energy and cardiovascular health.",
    description: "Coenzyme Q10 is a naturally occurring nutrient that acts as an antioxidant inside cells. It plays a critical role in generating ATP, supporting heart health, and defending cells against oxidative damage.",
    dosage: "60 Softgels · 100mg",
    purity: "99.0%+",
    molecular_weight: "863.34 g/mol",
    molecular_formula: "C59H90O4",
    price: 18.99,
    original_price: 23.99,
    discount_percent: 20,
    image_url: "/assets/products/asset 7.png",
    sku: "COQ10-100MG",
    stock_quantity: 250,
    category_slug: "supplements"
  },
  {
    name: "L. Reuteri (Probiotic)",
    slug: "l-reuteri",
    short_description: "Lactobacillus reuteri probiotic capsules for gut microbiome health.",
    description: "Lactobacillus reuteri is a well-studied probiotic strain that colonizes the human gastrointestinal tract. It supports digestive wellness, strengthens the immune system, and promotes a balanced microbiome.",
    dosage: "30 Capsules",
    purity: "Active Cultures",
    molecular_weight: "N/A",
    molecular_formula: "N/A",
    price: 20.99,
    original_price: 25.99,
    discount_percent: 19,
    image_url: "/assets/products/asset 9.png",
    sku: "LREUTERI-PROB",
    stock_quantity: 180,
    category_slug: "supplements"
  },
  // Gummies
  {
    name: "Protein + Creatine Gummies",
    slug: "protein-creatine-gummies",
    short_description: "Convenient gummies packed with creatine monohydrate and whey protein.",
    description: "A delicious way to fuel your workouts and recovery. Each gummy delivers precise amounts of high-quality creatine monohydrate and essential amino acids for muscle size, strength, and endurance.",
    dosage: "30 Gummies",
    purity: "Food Grade",
    molecular_weight: "N/A",
    molecular_formula: "N/A",
    price: 16.99,
    original_price: 19.99,
    discount_percent: 15,
    image_url: "/assets/products/asset 6.png",
    sku: "PROCRE-GUM",
    stock_quantity: 280,
    category_slug: "gummies"
  },
  // Add-ons
  {
    name: "Beef Liver Pills",
    slug: "beef-liver-pills",
    short_description: "Desiccated pasture-raised grass-fed beef liver capsules.",
    description: "Desiccated grass-fed beef liver capsules are a dense natural source of Vitamin A, Vitamin B12, Iron, and other essential trace minerals. Ideal for daily nutrition, boosting red blood cells, and natural energy synthesis.",
    dosage: "120 Capsules",
    purity: "Grass-Fed Organic",
    molecular_weight: "N/A",
    molecular_formula: "N/A",
    price: 19.99,
    original_price: 24.99,
    discount_percent: 20,
    image_url: "/assets/products/asset 8.png",
    sku: "BEEFLIVER-120",
    stock_quantity: 150,
    category_slug: "add-ons",
    variants: [
      { title: "Single Vial", price: 19.99, original_price: 24.99, sku: "BEEFLIVER-120", stock_quantity: 150, weight: "5 Gram" },
      { title: "Double Vial", price: 37.00, original_price: 45.00, sku: "BEEFLIVER-121", stock_quantity: 100, weight: "10 Gram" }
    ]
  }
];

client.connect()
  .then(async () => {
    console.log("Cleaning up existing products and categories...");
    await client.query("DELETE FROM rl_products;");
    await client.query("DELETE FROM rl_categories;");

    console.log("Seeding categories...");
    const categoryIds = {};
    for (const cat of categories) {
      const res = await client.query(
        "INSERT INTO rl_categories (id, name, slug, description, image_url, is_active, sort_order) VALUES (gen_random_uuid(), $1, $2, $3, null, true, 0) RETURNING id",
        [cat.name, cat.slug, cat.description]
      );
      categoryIds[cat.slug] = res.rows[0].id;
      console.log(`Created category: ${cat.name} (${res.rows[0].id})`);
    }

    console.log("Seeding products...");
    for (const prod of products) {
      const catId = categoryIds[prod.category_slug];
      if (!catId) {
        console.error(`Error: Category id not found for slug ${prod.category_slug}`);
        continue;
      }
      const res = await client.query(
        `INSERT INTO rl_products (
          id, category_id, name, slug, description, short_description, 
          dosage, purity, molecular_weight, molecular_formula, 
          price, original_price, discount_percent, image_url, 
          sku, stock_quantity, is_active, is_featured, sort_order, image_gallery
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, true, false, 0, $16
        ) RETURNING id`,
        [
          catId, prod.name, prod.slug, prod.description, prod.short_description,
          prod.dosage, prod.purity, prod.molecular_weight, prod.molecular_formula,
          prod.price, prod.original_price, prod.discount_percent, prod.image_url,
          prod.sku, prod.stock_quantity, []
        ]
      );
      const productId = res.rows[0].id;
      console.log(`Created product: ${prod.name}`);

      // Seed variants
      const prodVariants = prod.variants || [
        {
          title: "Single Vial",
          price: prod.price,
          original_price: prod.original_price,
          sku: prod.sku,
          stock_quantity: prod.stock_quantity,
          weight: ""
        }
      ];

      for (const v of prodVariants) {
        await client.query(
          `INSERT INTO rl_product_variants (product_id, title, price, original_price, sku, stock_quantity, weight)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [productId, v.title, v.price, v.original_price, v.sku, v.stock_quantity, v.weight]
        );
      }
    }

    console.log("SUCCESS: Seeding completed successfully!");
    return client.end();
  })
  .catch(err => {
    console.error("ERROR: Seeding failed:", err);
    process.exit(1);
  });
