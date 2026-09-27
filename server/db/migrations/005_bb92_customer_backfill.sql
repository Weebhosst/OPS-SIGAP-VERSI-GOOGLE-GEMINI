DO $$
DECLARE
  ais_customer_id text;
BEGIN
  IF EXISTS (SELECT 1 FROM sites WHERE id = 'BB92') THEN
    SELECT id
      INTO ais_customer_id
      FROM customers
     WHERE code = 'AIS' OR id = 'CUST-AIS'
     ORDER BY CASE WHEN code = 'AIS' THEN 0 ELSE 1 END
     LIMIT 1;

    IF ais_customer_id IS NULL THEN
      ais_customer_id := 'CUST-AIS';
      INSERT INTO customers(id, code, name, status, created_at, updated_at)
      VALUES(
        ais_customer_id,
        'AIS',
        'PT. ASTRA INFRA SOLUTIONS - SUBANG',
        'ACTIVE',
        now(),
        now()
      );
    ELSE
      UPDATE customers
         SET name = 'PT. ASTRA INFRA SOLUTIONS - SUBANG',
             status = 'ACTIVE',
             updated_at = now()
       WHERE id = ais_customer_id;
    END IF;

    UPDATE sites
       SET customer_id = ais_customer_id,
           code = COALESCE(NULLIF(code, ''), 'BB92'),
           updated_at = now()
     WHERE id = 'BB92';

    UPDATE user_assignments
       SET customer_id = ais_customer_id
     WHERE site_id = 'BB92';

    UPDATE shift_sessions
       SET customer_id = ais_customer_id,
           updated_at = now()
     WHERE site_id = 'BB92';

    UPDATE incident_reports
       SET customer_id = ais_customer_id,
           updated_at = now()
     WHERE site_id = 'BB92';

    UPDATE media
       SET customer_id = ais_customer_id
     WHERE site_id = 'BB92';
  END IF;
END $$;
