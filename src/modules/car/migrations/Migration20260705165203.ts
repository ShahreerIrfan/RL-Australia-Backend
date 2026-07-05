import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260705165203 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "car" ("id" text not null, "name" text not null, "brand" text not null, "year" integer not null, "color" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "car_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_car_deleted_at" ON "car" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "car" cascade;`);
  }

}
