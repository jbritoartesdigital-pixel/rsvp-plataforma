PRAGMA foreign_keys = ON;

-- Limite total opcional sem reconstruir as tabelas legadas.
-- As colunas max_people antigas permanecem por compatibilidade com o schema inicial.
-- A partir desta migration, *_limit e a fonte autoritativa:
-- NULL = sem limite total; inteiro = limite explicito.
ALTER TABLE events ADD COLUMN max_people_limit INTEGER
  CHECK(max_people_limit IS NULL OR (max_people_limit BETWEEN 1 AND 100));

ALTER TABLE guests ADD COLUMN max_people_limit INTEGER
  CHECK(max_people_limit IS NULL OR (max_people_limit BETWEEN 1 AND 100));

-- Preserva os limites existentes de eventos de lista.
-- Eventos livres antigos passam a seguir a regra correta: sem limite por padrao.
UPDATE events
SET max_people_limit = CASE
  WHEN rsvp_mode = 'list' THEN max_people
  ELSE NULL
END;

UPDATE guests
SET max_people_limit = CASE
  WHEN EXISTS (
    SELECT 1
    FROM events e
    WHERE e.id = guests.event_id
      AND e.rsvp_mode = 'list'
  ) THEN max_people
  ELSE NULL
END;
