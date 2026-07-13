const { Client } = require('pg');

// Use the production database string from environment or the explicit string in seed_db.js
const connectionString = process.env.DATABASE_URL || "postgresql://postgres:RlAustralia@187.127.141.36:5436/rlaustralia-rlaustralia";

const client = new Client({
  connectionString,
  ssl: false
});

async function seedQuiz() {
  await client.connect();
  console.log("Connected to database. Checking products to map IDs...");

  // Fetch all products from rl_products to map them by slug/handle
  const productRes = await client.query("SELECT id, slug FROM rl_products");
  const seededProducts = productRes.rows;
  console.log(`Found ${seededProducts.length} products in database.`);

  const bpc157 = seededProducts.find(p => p.slug === "bpc-157-5mg-vial")?.id || "";
  const tb500 = seededProducts.find(p => p.slug === "tb-500-5mg-vial")?.id || "";
  const nmn = seededProducts.find(p => p.slug === "nmn-softgels" || p.slug === "nmn")?.id || "";
  const coq10 = seededProducts.find(p => p.slug === "coq10")?.id || "";
  const beefLiver = seededProducts.find(p => p.slug === "beef-liver-pills")?.id || "";
  const glycine = seededProducts.find(p => p.slug === "glycine")?.id || "";
  const gummies = seededProducts.find(p => p.slug === "protein-creatine-gummies")?.id || "";
  const reuteri = seededProducts.find(p => p.slug === "l-reuteri")?.id || "";
  const ghkcu = seededProducts.find(p => p.slug === "ghk-cu-50mg-vial" || p.slug === "ghk-cu-serum")?.id || "";

  console.log("Creating rl_quiz_questions table if not exists...");
  await client.query(`
    CREATE TABLE IF NOT EXISTS rl_quiz_questions (
        id TEXT PRIMARY KEY,
        question_text TEXT NOT NULL,
        order_number INTEGER DEFAULT 0,
        image_url TEXT DEFAULT NULL,
        options JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  console.log("Cleaning up existing quiz questions...");
  await client.query("DELETE FROM rl_quiz_questions");

  const questions = [
    {
      id: "q1",
      question_text: "What Is Your Biological Sex?",
      order_number: 1,
      image_url: "https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?auto=format&fit=crop&w=600&q=80",
      options: [
        { id: "opt_sex_m", option_text: "Male", product_ids: [] },
        { id: "opt_sex_f", option_text: "Female", product_ids: [] },
        { id: "opt_sex_n", option_text: "I Prefer Not To Say", product_ids: [] }
      ]
    },
    {
      id: "q2",
      question_text: "What Is Your Age Range?",
      order_number: 2,
      image_url: "https://images.unsplash.com/photo-1508962914676-134849a727f0?auto=format&fit=crop&w=600&q=80",
      options: [
        { id: "opt_age_1", option_text: "18 - 25", product_ids: [] },
        { id: "opt_age_2", option_text: "26 - 35", product_ids: [] },
        { id: "opt_age_3", option_text: "36 - 45", product_ids: [] },
        { id: "opt_age_4", option_text: "46 - 55", product_ids: [] },
        { id: "opt_age_5", option_text: "56+", product_ids: [] }
      ]
    },
    {
      id: "q3",
      question_text: "What is your level of physical activity?",
      order_number: 3,
      image_url: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=600&q=80",
      options: [
        { id: "opt_act_sed", option_text: "Sedentary (Little/No Exercise)", product_ids: [] },
        { id: "opt_act_mod", option_text: "Moderate (1-3 Days/Week)", product_ids: [] },
        { id: "opt_act_act", option_text: "Active (3-5 Days/Week)", product_ids: [] },
        { id: "opt_act_ath", option_text: "Athlete (6-7 Days/Week)", product_ids: [] }
      ]
    },
    {
      id: "q4",
      question_text: "What is your primary focus?",
      order_number: 4,
      image_url: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=600&q=80",
      options: [
        { id: "opt_focus_anti_aging", option_text: "Anti-Aging", product_ids: [ghkcu].filter(Boolean) },
        { id: "opt_focus_recovery", option_text: "Muscle Recovery", product_ids: [bpc157, tb500].filter(Boolean) },
        { id: "opt_focus_cognition", option_text: "Cognition & Focus", product_ids: [nmn, coq10].filter(Boolean) },
        { id: "opt_focus_energy", option_text: "Energy & Vitality", product_ids: [nmn, coq10, beefLiver].filter(Boolean) },
        { id: "opt_focus_vitality", option_text: "General Health", product_ids: [beefLiver, reuteri].filter(Boolean) },
        { id: "opt_focus_joints", option_text: "Joint Health", product_ids: [bpc157].filter(Boolean) },
        { id: "opt_focus_longevity", option_text: "Longevity", product_ids: [nmn, coq10].filter(Boolean) },
        { id: "opt_focus_gut", option_text: "Gut Health", product_ids: [reuteri].filter(Boolean) },
        { id: "opt_focus_sleep", option_text: "Sleep Quality", product_ids: [glycine].filter(Boolean) },
        { id: "opt_focus_stress", option_text: "Stress & Anxiety", product_ids: [glycine, reuteri].filter(Boolean) }
      ]
    },
    {
      id: "q5",
      question_text: "Do you want to enhance your libido?",
      order_number: 5,
      image_url: "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=600&q=80",
      options: [
        { id: "opt_lib_y", option_text: "Yes", product_ids: [] },
        { id: "opt_lib_n", option_text: "No", product_ids: [] }
      ]
    }
  ];

  console.log("Seeding quiz questions...");
  for (const q of questions) {
    await client.query(
      `INSERT INTO rl_quiz_questions (id, question_text, order_number, image_url, options)
       VALUES ($1, $2, $3, $4, $5)`,
      [q.id, q.question_text, q.order_number, q.image_url, JSON.stringify(q.options)]
    );
    console.log(`Seeded question: ${q.question_text}`);
  }

  console.log("SUCCESS: Seeding dynamic quiz completed successfully!");
  await client.end();
}

seedQuiz().catch(err => {
  console.error("ERROR seeding quiz:", err);
  process.exit(1);
});
