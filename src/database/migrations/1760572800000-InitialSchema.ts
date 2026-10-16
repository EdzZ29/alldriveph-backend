import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The schema the API has used since launch. Every statement is IF NOT EXISTS, so databases that
 * were already set up keep their data and simply record this migration as applied.
 */
export class InitialSchema1760572800000 implements MigrationInterface {
  name = 'InitialSchema1760572800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID NOT NULL,
        email VARCHAR(255) NOT NULL,
        full_name VARCHAR(120) NOT NULL,
        hashed_password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL,
        is_active BOOLEAN NOT NULL,
        last_login_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        CONSTRAINT pk_users PRIMARY KEY (id)
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id UUID NOT NULL,
        slug VARCHAR(140) NOT NULL,
        name VARCHAR(140) NOT NULL,
        brand VARCHAR(60) NOT NULL,
        model VARCHAR(80) NOT NULL,
        year INTEGER NOT NULL,
        category VARCHAR(20) NOT NULL,
        transmission VARCHAR(20) NOT NULL,
        fuel_type VARCHAR(20) NOT NULL,
        seats INTEGER NOT NULL,
        luggage INTEGER NOT NULL,
        color VARCHAR(40),
        plate_number VARCHAR(20),
        daily_rate NUMERIC(10, 2) NOT NULL,
        driver_rate NUMERIC(10, 2) NOT NULL,
        zone_rates JSONB DEFAULT '{}' NOT NULL,
        image_url VARCHAR(500) NOT NULL,
        description TEXT NOT NULL,
        features VARCHAR(80)[] NOT NULL,
        branch VARCHAR(30) DEFAULT 'butuan' NOT NULL,
        is_featured BOOLEAN NOT NULL,
        is_active BOOLEAN NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        CONSTRAINT pk_vehicles PRIMARY KEY (id),
        CONSTRAINT uq_vehicles_plate_number UNIQUE (plate_number)
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_vehicles_is_active ON vehicles (is_active)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_vehicles_branch ON vehicles (branch)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ix_vehicles_slug ON vehicles (slug)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_vehicles_category ON vehicles (category)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id UUID NOT NULL,
        reference VARCHAR(16) NOT NULL,
        vehicle_id UUID NOT NULL,
        status VARCHAR(20) NOT NULL,
        service_type VARCHAR(20) NOT NULL,
        customer_name VARCHAR(120) NOT NULL,
        customer_email VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(30) NOT NULL,
        license_number VARCHAR(40),
        pickup_location VARCHAR(40) NOT NULL,
        return_location VARCHAR(40) NOT NULL,
        delivery_address VARCHAR(300),
        destination_zone VARCHAR(20) DEFAULT 'local' NOT NULL,
        destination VARCHAR(120),
        pickup_at TIMESTAMP WITH TIME ZONE NOT NULL,
        return_at TIMESTAMP WITH TIME ZONE NOT NULL,
        extras VARCHAR(40)[] NOT NULL,
        days INTEGER NOT NULL,
        daily_rate NUMERIC(10, 2) NOT NULL,
        base_amount NUMERIC(12, 2) NOT NULL,
        discount_amount NUMERIC(12, 2) NOT NULL,
        driver_amount NUMERIC(12, 2) NOT NULL,
        extras_amount NUMERIC(12, 2) NOT NULL,
        total_amount NUMERIC(12, 2) NOT NULL,
        notes TEXT,
        admin_notes TEXT,
        cancelled_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        CONSTRAINT pk_bookings PRIMARY KEY (id),
        CONSTRAINT ck_bookings_valid_period CHECK (return_at > pickup_at),
        CONSTRAINT ck_bookings_non_negative_total CHECK (total_amount >= 0),
        CONSTRAINT fk_bookings_vehicle_id_vehicles FOREIGN KEY (vehicle_id)
          REFERENCES vehicles (id) ON DELETE RESTRICT
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_bookings_vehicle_period ON bookings (vehicle_id, pickup_at, return_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_bookings_status ON bookings (status)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ix_bookings_reference ON bookings (reference)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_bookings_customer_email ON bookings (customer_email)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_bookings_vehicle_id ON bookings (vehicle_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS services (
        id UUID NOT NULL,
        slug VARCHAR(120) NOT NULL,
        title VARCHAR(120) NOT NULL,
        summary VARCHAR(300) NOT NULL,
        description TEXT NOT NULL,
        icon VARCHAR(40) NOT NULL,
        price_from NUMERIC(10, 2),
        highlights VARCHAR(120)[] NOT NULL,
        sort_order INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        CONSTRAINT pk_services PRIMARY KEY (id)
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ix_services_slug ON services (slug)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS partners (
        id UUID NOT NULL,
        name VARCHAR(120) NOT NULL,
        category VARCHAR(60) NOT NULL,
        description VARCHAR(400) NOT NULL,
        logo_url VARCHAR(500),
        website_url VARCHAR(500),
        sort_order INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        CONSTRAINT pk_partners PRIMARY KEY (id)
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS faqs (
        id UUID NOT NULL,
        question VARCHAR(300) NOT NULL,
        answer TEXT NOT NULL,
        category VARCHAR(60) NOT NULL,
        sort_order INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        CONSTRAINT pk_faqs PRIMARY KEY (id)
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_faqs_category ON faqs (category)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id UUID NOT NULL,
        slug VARCHAR(160) NOT NULL,
        title VARCHAR(200) NOT NULL,
        excerpt VARCHAR(400) NOT NULL,
        content TEXT NOT NULL,
        cover_image_url VARCHAR(500),
        author_name VARCHAR(120) NOT NULL,
        tags VARCHAR(40)[] NOT NULL,
        reading_minutes INTEGER NOT NULL,
        is_published BOOLEAN NOT NULL,
        published_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        CONSTRAINT pk_blog_posts PRIMARY KEY (id)
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_blog_posts_published_at ON blog_posts (published_at)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ix_blog_posts_slug ON blog_posts (slug)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_blog_posts_is_published ON blog_posts (is_published)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contact_messages (
        id UUID NOT NULL,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(30),
        subject VARCHAR(160) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        CONSTRAINT pk_contact_messages PRIMARY KEY (id)
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_contact_messages_is_read ON contact_messages (is_read)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_contact_messages_created_at ON contact_messages (created_at)`,
    );

    // left over from the Python (Alembic) migrations
    await queryRunner.query(`DROP TABLE IF EXISTS alembic_version`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'contact_messages',
      'blog_posts',
      'faqs',
      'partners',
      'services',
      'bookings',
      'vehicles',
      'users',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${table}`);
    }
  }
}
