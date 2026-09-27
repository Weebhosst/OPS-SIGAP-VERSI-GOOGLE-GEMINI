DO $$
DECLARE
  ais_customer_id text;
  lms_customer_id text;
BEGIN
  SELECT id
    INTO ais_customer_id
    FROM customers
   WHERE code = 'AIS'
      OR upper(trim(name)) = 'PT. ASTRA INFRA SOLUTIONS - SUBANG'
   ORDER BY CASE WHEN code = 'AIS' THEN 0 ELSE 1 END
   LIMIT 1;

  SELECT id
    INTO lms_customer_id
    FROM customers
   WHERE code = 'LMS'
      OR upper(trim(name)) = 'PT. LINTAS MARGA SEDAYA'
   ORDER BY CASE WHEN code = 'LMS' THEN 0 ELSE 1 END
   LIMIT 1;

  IF EXISTS (SELECT 1 FROM users WHERE npk = '231117') AND ais_customer_id IS NOT NULL THEN
    UPDATE users
       SET role = 'CHIEF',
           position = COALESCE(NULLIF(position, ''), 'CHIEF'),
           updated_at = now()
     WHERE npk = '231117';

    UPDATE user_assignments
       SET is_current = false,
           effective_until = now()
     WHERE user_id = (SELECT id FROM users WHERE npk = '231117')
       AND is_current;

    INSERT INTO user_assignments(
      id, user_id, customer_id, site_id, effective_from, effective_until, is_current, changed_by, created_at
    )
    SELECT
      'ASN-CHIEF-CUSTOMER-231117',
      id,
      ais_customer_id,
      NULL,
      now(),
      NULL,
      true,
      NULL,
      now()
    FROM users
    WHERE npk = '231117'
    ON CONFLICT (id) DO UPDATE
       SET customer_id = EXCLUDED.customer_id,
           site_id = NULL,
           effective_from = EXCLUDED.effective_from,
           effective_until = NULL,
           is_current = true;
  END IF;

  IF EXISTS (SELECT 1 FROM users WHERE npk = '230599') AND lms_customer_id IS NOT NULL THEN
    UPDATE users
       SET role = 'CHIEF',
           position = COALESCE(NULLIF(position, ''), 'CHIEF'),
           updated_at = now()
     WHERE npk = '230599';

    UPDATE user_assignments
       SET is_current = false,
           effective_until = now()
     WHERE user_id = (SELECT id FROM users WHERE npk = '230599')
       AND is_current;

    INSERT INTO user_assignments(
      id, user_id, customer_id, site_id, effective_from, effective_until, is_current, changed_by, created_at
    )
    SELECT
      'ASN-CHIEF-CUSTOMER-230599',
      id,
      lms_customer_id,
      NULL,
      now(),
      NULL,
      true,
      NULL,
      now()
    FROM users
    WHERE npk = '230599'
    ON CONFLICT (id) DO UPDATE
       SET customer_id = EXCLUDED.customer_id,
           site_id = NULL,
           effective_from = EXCLUDED.effective_from,
           effective_until = NULL,
           is_current = true;
  END IF;
END $$;
