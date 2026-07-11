import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

export default async function seedRecommendations({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const recommendationService = container.resolve("recommendation");

  logger.info("Starting custom seed of goal recommendations...");

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

  // Delete existing recommendations to prevent unique constraint conflicts on goal_name
  try {
    const existing = await recommendationService.listGoalRecommendations();
    if (existing.length > 0) {
      const ids = existing.map((e: any) => e.id);
      await recommendationService.deleteGoalRecommendations(ids);
      logger.info("Cleared existing recommendations");
    }
  } catch (e: any) {
    logger.warn("Failed to clear existing recommendations: " + e.message);
  }

  await recommendationService.createGoalRecommendations([
    {
      goal_name: "Cardiovascular",
      icon: "Heart",
      description: "Support cardiovascular efficiency, blood flow, and heart health.",
      product_ids: [coq10].filter(Boolean)
    },
    {
      goal_name: "Cognition",
      icon: "Brain",
      description: "Enhance memory, recall, cognitive speed, and target brain health.",
      product_ids: [nmn, reuteri].filter(Boolean)
    },
    {
      goal_name: "Energy",
      icon: "Zap",
      description: "Boost cellular energy production, stamina, and mitochondrial activity.",
      product_ids: [coq10, nmn, beefLiver].filter(Boolean)
    },
    {
      goal_name: "Fitness",
      icon: "Dumbbell",
      description: "Accelerate muscle recovery, endurance, and physical performance.",
      product_ids: [tb500, gummies].filter(Boolean)
    },
    {
      goal_name: "Focus",
      icon: "Target",
      description: "Improve mental focus, concentration levels, and attention span.",
      product_ids: [nmn, reuteri].filter(Boolean)
    },
    {
      goal_name: "Gut Health",
      icon: "ShieldAlert",
      description: "Repair gut lining, assist digestion, and balance the microbiome.",
      product_ids: [bpc157, kpv, reuteri].filter(Boolean)
    },
    {
      goal_name: "Hormones",
      icon: "Sparkles",
      description: "Promote natural hormone balance and endocrine system support.",
      product_ids: [reuteri, beefLiver].filter(Boolean)
    },
    {
      goal_name: "Immune",
      icon: "Shield",
      description: "Strengthen cellular defense mechanisms and immunological response.",
      product_ids: [kpv, beefLiver].filter(Boolean)
    },
    {
      goal_name: "Longevity",
      icon: "Hourglass",
      description: "Slow cellular aging, promote DNA repair, and boost vitality.",
      product_ids: [nmn, glycine, ghkcu].filter(Boolean)
    },
    {
      goal_name: "Metabolism",
      icon: "Flame",
      description: "Optimize metabolic rate, nutrient absorption, and body fat composition.",
      product_ids: [beefLiver, coq10].filter(Boolean)
    },
    {
      goal_name: "Mood",
      icon: "Smile",
      description: "Elevate daily mood, promote relaxation, and optimize sleep cycles.",
      product_ids: [reuteri, glycine].filter(Boolean)
    },
    {
      goal_name: "Motivation",
      icon: "Award",
      description: "Increase drive, focus, mental clarity, and executive function.",
      product_ids: [gummies, nmn].filter(Boolean)
    }
  ] as any);

  logger.info("Finished seeding dynamic custom recommendations.");
}
