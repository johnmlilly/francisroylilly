-- Local dev seed data. Apply with `npm run db:seed` (local D1 only).
INSERT INTO Comment (postSlug, name, email, message, createdAt) VALUES
  ('april-1-2025', 'John Lilly', 'seed@example.com', 'Test', '2025-04-01T12:00:00.000Z'),
  ('april-1-2025', 'Kara', 'seed@example.com', 'Another test', '2025-04-01T12:05:00.000Z');

INSERT INTO Reaction (postSlug, loves) VALUES
  ('first-post', 2),
  ('second-post', 5);
