CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" varchar(100) DEFAULT 'Jabloňová Open' NOT NULL,
	"logo_url" text DEFAULT '/logo.png' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
