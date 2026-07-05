import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260705065100 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "saved_stack" ("id" text not null, "name" text not null, "customer_id" text null, "goal" text null, "items" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "saved_stack_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_saved_stack_deleted_at" ON "saved_stack" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "saved_stack" cascade;`);
  }

}
