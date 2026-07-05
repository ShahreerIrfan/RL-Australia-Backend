import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260705065103 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "goal_recommendation" drop constraint if exists "goal_recommendation_goal_name_unique";`);
    this.addSql(`create table if not exists "goal_recommendation" ("id" text not null, "goal_name" text not null, "description" text null, "product_ids" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "goal_recommendation_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_goal_recommendation_goal_name_unique" ON "goal_recommendation" ("goal_name") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_goal_recommendation_deleted_at" ON "goal_recommendation" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "goal_recommendation" cascade;`);
  }

}
