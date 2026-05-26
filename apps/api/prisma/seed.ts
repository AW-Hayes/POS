import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Demo Store',
      slug: 'demo',
      settings: { currency: 'USD', timezone: 'America/New_York', taxRate: 0.08 },
    },
  });

  const adminPassword = await bcrypt.hash('admin1234', 12);
  const managerPassword = await bcrypt.hash('manager1234', 12);
  const cashierPin = await bcrypt.hash('1234', 10);

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@demo.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@demo.com',
      name: 'Admin User',
      passwordHash: adminPassword,
      role: 'admin',
    },
  });

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'manager@demo.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'manager@demo.com',
      name: 'Store Manager',
      passwordHash: managerPassword,
      role: 'manager',
    },
  });

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'cashier@demo.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'cashier@demo.com',
      name: 'Cashier One',
      passwordHash: await bcrypt.hash('cashier1234', 12),
      pin: cashierPin,
      role: 'cashier',
    },
  });

  const location = await prisma.location.upsert({
    where: { id: 'loc_main' },
    update: {},
    create: {
      id: 'loc_main',
      tenantId: tenant.id,
      name: 'Main Store',
      address: '123 Main St',
    },
  });

  await prisma.register.upsert({
    where: { id: 'reg_1' },
    update: {},
    create: { id: 'reg_1', locationId: location.id, name: 'Register 1', mode: 'desktop' },
  });

  await prisma.register.upsert({
    where: { id: 'reg_2' },
    update: {},
    create: { id: 'reg_2', locationId: location.id, name: 'Tablet Kiosk', mode: 'touch' },
  });

  // Sample categories
  const electronics = await prisma.category.upsert({
    where: { id: 'cat_electronics' },
    update: {},
    create: { id: 'cat_electronics', tenantId: tenant.id, name: 'Electronics', color: '#3B82F6' },
  });

  const clothing = await prisma.category.upsert({
    where: { id: 'cat_clothing' },
    update: {},
    create: { id: 'cat_clothing', tenantId: tenant.id, name: 'Clothing', color: '#10B981' },
  });

  // Attribute definitions
  const sizeAttr = await prisma.attributeDefinition.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Size' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Size', values: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
  });

  const colorAttr = await prisma.attributeDefinition.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Color' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Color', values: ['Red', 'Blue', 'Green', 'Black', 'White'] },
  });

  // Sample products
  const usb = await prisma.product.upsert({
    where: { tenantId_sku: { tenantId: tenant.id, sku: 'USB-HUB-4P' } },
    update: {},
    create: {
      tenantId: tenant.id,
      categoryId: electronics.id,
      name: 'USB Hub 4-Port',
      sku: 'USB-HUB-4P',
      barcode: '123456789012',
      price: 24.99,
      cost: 8.50,
      taxable: true,
      trackInventory: true,
    },
  });

  await prisma.inventoryItem.upsert({
    where: { locationId_productId_variantId: { locationId: location.id, productId: usb.id, variantId: null } },
    update: {},
    create: { locationId: location.id, productId: usb.id, quantity: 50, lowStockAt: 10 },
  });

  const tshirt = await prisma.product.upsert({
    where: { tenantId_sku: { tenantId: tenant.id, sku: 'TSHIRT-BASIC' } },
    update: {},
    create: {
      tenantId: tenant.id,
      categoryId: clothing.id,
      name: 'Basic T-Shirt',
      sku: 'TSHIRT-BASIC',
      price: 19.99,
      cost: 4.00,
      taxable: true,
      trackInventory: true,
      attributes: {
        create: [
          { attributeId: sizeAttr.id },
          { attributeId: colorAttr.id },
        ],
      },
    },
    include: { attributes: true },
  });

  // A couple of sample variants
  const [paSmall, paColor] = tshirt.attributes;
  for (const size of ['S', 'M', 'L']) {
    const variant = await prisma.productVariant.create({
      data: {
        productId: tshirt.id,
        sku: `TSHIRT-BASIC-${size}-BLK`,
        attributeValues: {
          create: [
            { productAttributeId: paSmall.id, value: size },
            { productAttributeId: paColor.id, value: 'Black' },
          ],
        },
      },
    });
    await prisma.inventoryItem.create({
      data: { locationId: location.id, productId: tshirt.id, variantId: variant.id, quantity: 20, lowStockAt: 5 },
    });
  }

  console.log('Seed complete.');
  console.log('  Tenant slug: demo');
  console.log('  Admin:   admin@demo.com / admin1234');
  console.log('  Manager: manager@demo.com / manager1234');
  console.log('  Cashier: cashier@demo.com / cashier1234  (PIN: 1234)');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
