import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

export default async function seedQuiz({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const quizService = container.resolve("quiz");

  logger.info("Starting custom seed of quiz questions and options...");

  const { data: seededProducts } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
  });

  const bpc157 = seededProducts.find((p: any) => p.handle === "bpc-157")?.id || "";
  const tb500 = seededProducts.find((p: any) => p.handle === "tb-500")?.id || "";
  const kpv = seededProducts.find((p: any) => p.handle === "kpv")?.id || "";
  const nmn = seededProducts.find((p: any) => p.handle === "nmn")?.id || "";
  const coq10 = seededProducts.find((p: any) => p.handle === "coq10")?.id || "";
  const beefLiver = seededProducts.find((p: any) => p.handle === "beef-liver-pills")?.id || "";
  const glycine = seededProducts.find((p: any) => p.handle === "glycine")?.id || "";
  const gummies = seededProducts.find((p: any) => p.handle === "protein-creatine-gummies")?.id || "";
  const reuteri = seededProducts.find((p: any) => p.handle === "l-reuteri")?.id || "";
  const ghkcu = seededProducts.find((p: any) => p.handle === "ghk-cu-serum")?.id || "";

  // Delete existing quiz questions to prevent duplication
  try {
    const existing = await quizService.listQuizQuestions();
    if (existing.length > 0) {
      const ids = existing.map((e: any) => e.id);
      await quizService.deleteQuizQuestions(ids);
      logger.info("Cleared existing quiz questions");
    }
  } catch (e: any) {
    logger.warn("Failed to clear existing quiz questions: " + e.message);
  }

  // Seed the 5 questions
  await quizService.createQuizQuestions([
    {
      question_text: "What Is Your Biological Sex?",
      order_number: 1,
      image_url: "https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?auto=format&fit=crop&w=600&q=80",
      options: [
        { id: "opt_sex_m", option_text: "Male", product_ids: [] },
        { id: "opt_sex_f", option_text: "Female", product_ids: [] },
        { id: "opt_sex_not_say", option_text: "I Prefer Not To Say", product_ids: [] }
      ]
    },
    {
      question_text: "What Is Your Age Range?",
      order_number: 2,
      image_url: "https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=600&q=80",
      options: [
        { id: "opt_age_1", option_text: "18-34", product_ids: [] },
        { id: "opt_age_2", option_text: "35-54", product_ids: [] },
        { id: "opt_age_3", option_text: "55+", product_ids: [] }
      ]
    },
    {
      question_text: "What is your level of physical activity?",
      order_number: 3,
      image_url: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=600&q=80",
      options: [
        { id: "opt_act_1", option_text: "Sedentary", product_ids: [] },
        { id: "opt_act_2", option_text: "Somewhat Active", product_ids: [] },
        { id: "opt_act_3", option_text: "Regularly Workout", product_ids: [] }
      ]
    },
    {
      question_text: "What is your primary focus?",
      order_number: 4,
      image_url: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=600&q=80",
      options: [
        { id: "opt_focus_cv", option_text: "Cardiovascular", product_ids: [coq10].filter(Boolean) },
        { id: "opt_focus_cog", option_text: "Cognition", product_ids: [nmn, reuteri].filter(Boolean) },
        { id: "opt_focus_en", option_text: "Energy", product_ids: [coq10, nmn, beefLiver].filter(Boolean) },
        { id: "opt_focus_fit", option_text: "Fitness", product_ids: [tb500, gummies].filter(Boolean) },
        { id: "opt_focus_foc", option_text: "Focus", product_ids: [nmn, reuteri].filter(Boolean) },
        { id: "opt_focus_gut", option_text: "Gut Health", product_ids: [bpc157, kpv, reuteri].filter(Boolean) },
        { id: "opt_focus_hor", option_text: "Hormone Support", product_ids: [reuteri, beefLiver].filter(Boolean) },
        { id: "opt_focus_imm", option_text: "Immune", product_ids: [kpv, beefLiver].filter(Boolean) },
        { id: "opt_focus_lon", option_text: "Longevity", product_ids: [nmn, glycine, ghkcu].filter(Boolean) },
        { id: "opt_focus_met", option_text: "Metabolism", product_ids: [beefLiver, coq10].filter(Boolean) },
        { id: "opt_focus_mood", option_text: "Mood", product_ids: [reuteri, glycine].filter(Boolean) },
        { id: "opt_focus_mot", option_text: "Motivation", product_ids: [gummies, nmn].filter(Boolean) },
        { id: "opt_focus_pain", option_text: "Pain & Inflammation", product_ids: [bpc157, kpv].filter(Boolean) },
        { id: "opt_focus_skin", option_text: "Skin Health", product_ids: [ghkcu].filter(Boolean) },
        { id: "opt_focus_sleep", option_text: "Sleep", product_ids: [glycine].filter(Boolean) },
        { id: "opt_focus_stress", option_text: "Stress", product_ids: [glycine, reuteri].filter(Boolean) }
      ]
    },
    {
      question_text: "Do you want to enhance your libido?",
      order_number: 5,
      image_url: "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=600&q=80",
      options: [
        { id: "opt_lib_y", option_text: "Yes", product_ids: [] },
        { id: "opt_lib_n", option_text: "No", product_ids: [] }
      ]
    }
  ] as any);

  logger.info("Finished seeding dynamic quiz questions.");
}
