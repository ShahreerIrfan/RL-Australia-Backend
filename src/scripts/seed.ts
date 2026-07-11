import { CreateInventoryLevelInput, ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresStep,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";
import { ApiKey } from "../../.medusa/types/query-entry-points";

const updateStoreCurrencies = createWorkflow(
  "update-store-currencies",
  (input: {
    supported_currencies: { currency_code: string; is_default?: boolean }[];
    store_id: string;
  }) => {
    const normalizedInput = transform({ input }, (data) => {
      return {
        selector: { id: data.input.store_id },
        update: {
          supported_currencies: data.input.supported_currencies.map(
            (currency) => {
              return {
                currency_code: currency.currency_code,
                is_default: currency.is_default ?? false,
              };
            }
          ),
        },
      };
    });

    const stores = updateStoresStep(normalizedInput);

    return new WorkflowResponse(stores);
  }
);

export default async function seedDemoData({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);
  const storeModuleService = container.resolve(Modules.STORE);

  const countries = ["gb", "de", "dk", "se", "fr", "es", "it"];

  logger.info("Seeding store data...");
  const [store] = await storeModuleService.listStores();
  let defaultSalesChannel = await salesChannelModuleService.listSalesChannels({
    name: "Default Sales Channel",
  });

  if (!defaultSalesChannel.length) {
    // create the default sales channel
    const { result: salesChannelResult } = await createSalesChannelsWorkflow(
      container
    ).run({
      input: {
        salesChannelsData: [
          {
            name: "Default Sales Channel",
          },
        ],
      },
    });
    defaultSalesChannel = salesChannelResult;
  }

  await updateStoreCurrencies(container).run({
    input: {
      store_id: store.id,
      supported_currencies: [
        {
          currency_code: "eur",
          is_default: true,
        },
        {
          currency_code: "usd",
        },
      ],
    },
  });

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        default_sales_channel_id: defaultSalesChannel[0].id,
      },
    },
  });
  logger.info("Seeding region data...");
  const { result: regionResult } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "Europe",
          currency_code: "eur",
          countries,
          payment_providers: ["pp_system_default"],
        },
      ],
    },
  });
  const region = regionResult[0];
  logger.info("Finished seeding regions.");

  logger.info("Seeding tax regions...");
  await createTaxRegionsWorkflow(container).run({
    input: countries.map((country_code) => ({
      country_code,
      provider_id: "tp_system",
    })),
  });
  logger.info("Finished seeding tax regions.");

  logger.info("Seeding stock location data...");
  const { result: stockLocationResult } = await createStockLocationsWorkflow(
    container
  ).run({
    input: {
      locations: [
        {
          name: "European Warehouse",
          address: {
            city: "Copenhagen",
            country_code: "DK",
            address_1: "",
          },
        },
      ],
    },
  });
  const stockLocation = stockLocationResult[0];

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        default_location_id: stockLocation.id,
      },
    },
  });

  await link.create({
    [Modules.STOCK_LOCATION]: {
      stock_location_id: stockLocation.id,
    },
    [Modules.FULFILLMENT]: {
      fulfillment_provider_id: "manual_manual",
    },
  });

  logger.info("Seeding fulfillment data...");
  const shippingProfiles = await fulfillmentModuleService.listShippingProfiles({
    type: "default",
  });
  let shippingProfile = shippingProfiles.length ? shippingProfiles[0] : null;

  if (!shippingProfile) {
    const { result: shippingProfileResult } =
      await createShippingProfilesWorkflow(container).run({
        input: {
          data: [
            {
              name: "Default Shipping Profile",
              type: "default",
            },
          ],
        },
      });
    shippingProfile = shippingProfileResult[0];
  }

  const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
    name: "European Warehouse delivery",
    type: "shipping",
    service_zones: [
      {
        name: "Europe",
        geo_zones: [
          {
            country_code: "gb",
            type: "country",
          },
          {
            country_code: "de",
            type: "country",
          },
          {
            country_code: "dk",
            type: "country",
          },
          {
            country_code: "se",
            type: "country",
          },
          {
            country_code: "fr",
            type: "country",
          },
          {
            country_code: "es",
            type: "country",
          },
          {
            country_code: "it",
            type: "country",
          },
        ],
      },
    ],
  });

  await link.create({
    [Modules.STOCK_LOCATION]: {
      stock_location_id: stockLocation.id,
    },
    [Modules.FULFILLMENT]: {
      fulfillment_set_id: fulfillmentSet.id,
    },
  });

  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Standard Shipping",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Standard",
          description: "Ship in 2-3 days.",
          code: "standard",
        },
        prices: [
          {
            currency_code: "usd",
            amount: 10,
          },
          {
            currency_code: "eur",
            amount: 10,
          },
          {
            region_id: region.id,
            amount: 10,
          },
        ],
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq",
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq",
          },
        ],
      },
      {
        name: "Express Shipping",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Express",
          description: "Ship in 24 hours.",
          code: "express",
        },
        prices: [
          {
            currency_code: "usd",
            amount: 10,
          },
          {
            currency_code: "eur",
            amount: 10,
          },
          {
            region_id: region.id,
            amount: 10,
          },
        ],
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq",
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq",
          },
        ],
      },
    ],
  });
  logger.info("Finished seeding fulfillment data.");

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: stockLocation.id,
      add: [defaultSalesChannel[0].id],
    },
  });
  logger.info("Finished seeding stock location data.");

  logger.info("Seeding publishable API key data...");
  let publishableApiKey: ApiKey | null = null;
  const { data } = await query.graph({
    entity: "api_key",
    fields: ["id"],
    filters: {
      type: "publishable",
    },
  });

  publishableApiKey = data?.[0];

  if (!publishableApiKey) {
    const {
      result: [publishableApiKeyResult],
    } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [
          {
            title: "Webshop",
            type: "publishable",
            created_by: "",
          },
        ],
      },
    });

    publishableApiKey = publishableApiKeyResult as ApiKey;
  }

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: {
      id: publishableApiKey.id,
      add: [defaultSalesChannel[0].id],
    },
  });
  logger.info("Finished seeding publishable API key data.");

  logger.info("Seeding product categories...");

  const { result: categoryResult } = await createProductCategoriesWorkflow(
    container
  ).run({
    input: {
      product_categories: [
        {
          name: "Peptides",
          is_active: true,
        },
        {
          name: "Nootropics & Supplements",
          is_active: true,
        },
        {
          name: "Gummies & Functional Foods",
          is_active: true,
        },
        {
          name: "Add-ons & Accessories",
          is_active: true,
        },
      ],
    },
  });

  logger.info("Seeding peptide and supplement products...");

  await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "BPC-157",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Peptides")!.id,
          ],
          description: "BPC-157 is a pentadecapeptide composed of 15 amino acids, widely researched for its regenerative properties, tissue healing, and fast recovery.",
          handle: "bpc-157",
          weight: 400,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          metadata: {
            dosage_mg: "5mg",
            vial_size: "10ml",
            coa_url: "https://rlaustralia.com/coas/bpc157.pdf"
          },
          images: [
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png",
            },
          ],
          options: [
            {
              title: "Vial Size",
              values: ["5mg"],
            },
          ],
          variants: [
            {
              title: "5mg",
              sku: "BPC-157-5MG",
              options: {
                "Vial Size": "5mg",
              },
              prices: [
                {
                  amount: 49.99,
                  currency_code: "usd",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
        {
          title: "TB-500",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Peptides")!.id,
          ],
          description: "TB-500 is a synthetic version of the active region of Thymosin Beta-4, research-proven to promote vascular growth, tissue flexibility, and fast wound healing.",
          handle: "tb-500",
          weight: 400,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          metadata: {
            dosage_mg: "5mg",
            vial_size: "10ml",
            coa_url: "https://rlaustralia.com/coas/tb500.pdf"
          },
          images: [
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png",
            },
          ],
          options: [
            {
              title: "Vial Size",
              values: ["5mg"],
            },
          ],
          variants: [
            {
              title: "5mg",
              sku: "TB-500-5MG",
              options: {
                "Vial Size": "5mg",
              },
              prices: [
                {
                  amount: 54.99,
                  currency_code: "usd",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
        {
          title: "KPV",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Peptides")!.id,
          ],
          description: "KPV is an anti-inflammatory tripeptide (Lysine-Proline-Valine) researched for gut lining repair, immunological stability, and microbiome support.",
          handle: "kpv",
          weight: 400,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          metadata: {
            dosage_mg: "10mg",
            vial_size: "5ml",
            coa_url: "https://rlaustralia.com/coas/kpv.pdf"
          },
          images: [
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png",
            },
          ],
          options: [
            {
              title: "Vial Size",
              values: ["10mg"],
            },
          ],
          variants: [
            {
              title: "10mg",
              sku: "KPV-10MG",
              options: {
                "Vial Size": "10mg",
              },
              prices: [
                {
                  amount: 59.99,
                  currency_code: "usd",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
        {
          title: "Beef Liver Pills",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Nootropics & Supplements")!.id,
          ],
          description: "100% grass-fed desiccated beef liver capsules. Loaded with natural B12, vitamin A, iron, and folate.",
          handle: "beef-liver-pills",
          weight: 200,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          metadata: {
            is_addon: true,
            was_price: 24.99,
            hook_text: "Nature's multivitamin: B12, iron & folate in one tiny pill."
          },
          images: [
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png",
            },
          ],
          options: [
            {
              title: "Quantity",
              values: ["120 Capsules"],
            },
          ],
          variants: [
            {
              title: "120 Capsules",
              sku: "BEEF-LIVER-120",
              options: {
                "Quantity": "120 Capsules",
              },
              prices: [
                {
                  amount: 19.99,
                  currency_code: "usd",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
        {
          title: "Glycine",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Nootropics & Supplements")!.id,
          ],
          description: "Pure pharmaceutical-grade Glycine powder. Essential for sleep quality, joint support, and skin health.",
          handle: "glycine",
          weight: 500,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          metadata: {
            is_addon: true,
            was_price: 21.99,
            hook_text: "The sleep-and-skin amino acid your stack is missing."
          },
          images: [
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png",
            },
          ],
          options: [
            {
              title: "Quantity",
              values: ["500g"],
            },
          ],
          variants: [
            {
              title: "500g",
              sku: "GLYCINE-500G",
              options: {
                "Quantity": "500g",
              },
              prices: [
                {
                  amount: 17.99,
                  currency_code: "usd",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
        {
          title: "CoQ10",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Nootropics & Supplements")!.id,
          ],
          description: "Coenzyme Q10 (CoQ10) is a crucial antioxidant necessary for cellular energy production and mitochondrial function.",
          handle: "coq10",
          weight: 150,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          metadata: {
            is_addon: true,
            was_price: 23.99,
            hook_text: "Mitochondrial fuel for energy that actually lasts."
          },
          images: [
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png",
            },
          ],
          options: [
            {
              title: "Quantity",
              values: ["60 Softgels"],
            },
          ],
          variants: [
            {
              title: "60 Softgels",
              sku: "COQ10-60",
              options: {
                "Quantity": "60 Softgels",
              },
              prices: [
                {
                  amount: 18.99,
                  currency_code: "usd",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
        {
          title: "NMN",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Nootropics & Supplements")!.id,
          ],
          description: "Nicotinamide Mononucleotide (NMN) is a direct precursor to NAD+, assisting cellular energy, repair, and longevity.",
          handle: "nmn",
          weight: 100,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          metadata: {
            is_addon: true,
            was_price: 28.99,
            hook_text: "The NAD+ booster everyone's stacking for longevity."
          },
          images: [
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png",
            },
          ],
          options: [
            {
              title: "Quantity",
              values: ["30g Powder"],
            },
          ],
          variants: [
            {
              title: "30g Powder",
              sku: "NMN-30G",
              options: {
                "Quantity": "30g Powder",
              },
              prices: [
                {
                  amount: 22.99,
                  currency_code: "usd",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
        {
          title: "Protein + Creatine Gummies",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Gummies & Functional Foods")!.id,
          ],
          description: "Delicious functional gummies packed with high-quality protein and creatine monohydrate.",
          handle: "protein-creatine-gummies",
          weight: 200,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          metadata: {
            is_addon: true,
            was_price: 19.99,
            hook_text: "Gains in gummy form. No shaker, no excuses."
          },
          images: [
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png",
            },
          ],
          options: [
            {
              title: "Flavor",
              values: ["Sour Cherry"],
            },
          ],
          variants: [
            {
              title: "Sour Cherry",
              sku: "GUMMY-CREATINE-CHERRY",
              options: {
                "Flavor": "Sour Cherry",
              },
              prices: [
                {
                  amount: 16.99,
                  currency_code: "usd",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
        {
          title: "L. Reuteri Probiotic",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Nootropics & Supplements")!.id,
          ],
          description: "Specialized Lactobacillus reuteri strain targeting gut microbiome and natural oxytocin support.",
          handle: "l-reuteri",
          weight: 150,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          metadata: {
            is_addon: true,
            was_price: 25.99,
            hook_text: "Gut health meets feel-good hormones — supports natural oxytocin production."
          },
          images: [
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png",
            },
          ],
          options: [
            {
              title: "Quantity",
              values: ["60 Capsules"],
            },
          ],
          variants: [
            {
              title: "60 Capsules",
              sku: "L-REUTERI-60",
              options: {
                "Quantity": "60 Capsules",
              },
              prices: [
                {
                  amount: 20.99,
                  currency_code: "usd",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
        {
          title: "Copper Peptide Serum",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Add-ons & Accessories")!.id,
          ],
          description: "Premium GHK-Cu Copper Peptide facial serum designed for skin elasticity and anti-aging firmness.",
          handle: "ghk-cu-serum",
          weight: 150,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          metadata: {
            is_addon: true,
            was_price: 89.95,
            hook_text: "Your peptides, but for your skin — visible firmness and glow."
          },
          images: [
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png",
            },
          ],
          options: [
            {
              title: "Size",
              values: ["30ml"],
            },
          ],
          variants: [
            {
              title: "30ml",
              sku: "GHK-CU-30ML",
              options: {
                "Size": "30ml",
              },
              prices: [
                {
                  amount: 69.95,
                  currency_code: "usd",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
      ],
    },
  });

  logger.info("Finished seeding client product data.");

  logger.info("Seeding inventory levels...");

  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id"],
  });

  const inventoryLevels: CreateInventoryLevelInput[] = [];
  for (const inventoryItem of inventoryItems) {
    const inventoryLevel = {
      location_id: stockLocation.id,
      stocked_quantity: 1000000,
      inventory_item_id: inventoryItem.id,
    };
    inventoryLevels.push(inventoryLevel);
  }

  await createInventoryLevelsWorkflow(container).run({
    input: {
      inventory_levels: inventoryLevels,
    },
  });

  logger.info("Finished seeding inventory levels.");

  // Seeding custom goals and guides
  logger.info("Seeding custom guides and goal recommendations...");

  const { data: seededProducts } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
  });

  const guideService = container.resolve("guide");
  const recommendationService = container.resolve("recommendation");

  // Create default guides
  await guideService.createGuides([
    {
      title: "BPC-157 Reconstruction & Dosing Guide",
      handle: "bpc-157-dosing-guide",
      pdf_url: "https://rlaustralia.com/guides/bpc157-guide.pdf",
      is_gated: true,
      description: "The complete step-by-step clinical protocol on reconstructing, mixing, and dosing BPC-157."
    },
    {
      title: "Introduction to Anti-Inflammatory Peptides",
      handle: "intro-anti-inflammatory-peptides",
      pdf_url: "https://rlaustralia.com/guides/anti-inflammation.pdf",
      is_gated: false,
      description: "A free introduction to how peptides target and reduce systemic inflammation in the body."
    }
  ]);

  // Create goal recommendations linking to real product IDs
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
      icon: "Shield",
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

  logger.info("Finished seeding custom client modules.");
}
