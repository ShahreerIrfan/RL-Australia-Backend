import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260705065102 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "guide" drop constraint if exists "guide_handle_unique";`);
    this.addSql(`create table if not exists "guide" ("id" text not null, "title" text not null, "handle" text not null, "pdf_url" text not null, "is_gated" boolean not null default false, "description" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "guide_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_guide_handle_unique" ON "guide" ("handle") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_guide_deleted_at" ON "guide" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "lead" ("id" text not null, "email" text not null, "guide_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "lead_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_lead_deleted_at" ON "lead" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "guide" cascade;`);

    this.addSql(`drop table if exists "lead" cascade;`);
  }

}
