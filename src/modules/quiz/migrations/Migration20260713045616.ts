import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260713045616 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "quiz_question" ("id" text not null, "question_text" text not null, "order_number" integer not null default 0, "image_url" text null, "options" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "quiz_question_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_quiz_question_deleted_at" ON "quiz_question" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "quiz_question" cascade;`);
  }

}
