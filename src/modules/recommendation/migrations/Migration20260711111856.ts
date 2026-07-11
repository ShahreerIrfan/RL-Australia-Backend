import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260711111856 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "goal_recommendation" add column if not exists "icon" text not null default 'Heart';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "goal_recommendation" drop column if exists "icon";`);
  }

}
