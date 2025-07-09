import { pgTable, uuid, text, timestamp, integer, pgEnum } from 'drizzle-orm/pg-core';

// Define the status enum
export const statusEnum = pgEnum('status', ['pending', 'completed', 'failed', 'canceled', 'deleted']);

// Define the images table
export const images = pgTable('images', {
  // Identity fields
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  
  // File information
  objectKey: text('object_key').notNull(),
  fileUrl: text('file_url').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  
  // Status and timing
  status: statusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
});

// Export the type for TypeScript
export type Image = typeof images.$inferSelect;
export type NewImage = typeof images.$inferInsert;
