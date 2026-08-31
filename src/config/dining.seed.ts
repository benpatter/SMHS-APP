/**
 * The REAL Hanna's on Campus menu, extracted from the school's published
 * student-menu PDF (smhs.org resource 1d9003cf…, pulled 2026-07-10 via
 * pdftotext). Prices and ingredient lists are verbatim from that document.
 *
 * The menu changes when Hanna's updates the PDF, so everything here is
 * ADMIN-EDITABLE in the app: Admin → Campus Dining can edit names/prices/
 * descriptions, hide items, and add new ones (see `admin.dining*` in
 * lib/store.ts + mergeDiningItems in lib/adminOverlay.ts). This file is only
 * the starting point a fresh device ships with. Baked 2026-07-30 from the
 * school's live server data (the admin-curated menu).
 */

export type MenuSection = 'breakfast' | 'lunch' | 'elite';

export interface MenuItem {
  id: string;
  section: MenuSection;
  /** Menu board grouping, e.g. "Grab & Go", "Hot Items". */
  group: string;
  name: string;
  /** Ingredient line from the published menu (optional). */
  description?: string;
  /** Display price, e.g. "$9.75" (or "$9.75 / $11.00" for two sizes). */
  price: string;
  /** Admin-hidden (server-owned data): kept but not shown to students. */
  hidden?: boolean;
}

/**
 * Hanna's service hours as the school publishes them ("Hours: 7:00 a.m. — 3:00
 * p.m. daily"). The live page is still read first and an admin override still
 * beats both — this is what the card shows when neither is available, which on
 * a phone with no signal is most of the time. Before it existed the card said
 * "Hours unavailable" for the school's own published hours.
 */
export const DINING_HOURS_DEFAULT = '7:00 AM – 3:00 PM';

/**
 * The school's lunch-by-building chart, verbatim from the Campus Dining page.
 * Same deal: the live table wins, this keeps "Who eats when" answerable offline.
 * `buildings.ts` derives a student's own track from the same assignment.
 */
export const DINING_LUNCH_DEFAULT: { first: string[]; second: string[] } = {
  first: [
    'Crean Hall (B building)',
    'Talon Dome',
    'Borchard Science Labs (C building)',
    'Academic Services Center (S building)',
    'All science classes',
  ],
  second: [
    'Lyon Hall (A building)',
    'Trailers (T buildings)',
    'Eagle Athletic Center (R building)',
    'Moiso Family Pavilion (Gym)',
    'G building',
    'Library',
  ],
};

/**
 * The school's Campus Dining page — the page every field here is copied from,
 * and where the menu itself lives when Hanna's changes it mid-year.
 */
export const DINING_URL = 'https://www.smhs.org/campus-life/campusdining';

/**
 * The Campus Dining Guidelines, verbatim from that page. The live scrape wins
 * when the proxy can reach the site; this is what an offline phone shows, which
 * is exactly when a student is standing in the line wondering about the rules.
 */
export const DINING_GUIDELINES_DEFAULT: string[] = [
  'SMCHS is a closed campus, so students must remain on campus during the nutrition breaks.',
  'Students must stay in the designated boundaries during the nutrition breaks.',
  'The area to the far left side of the service windows is a dedicated Haute Cafe line.',
  'Students are expected to adhere to the SMCHS Cell Phone Policy at all times. However, students may use their cell phones to pay for lunch. See the SMCHS Cell Phone Policy for more information.',
];

export const MENU_SECTIONS: { id: MenuSection; label: string; note?: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'elite', label: 'Elite Performance', note: '1:00–3:00 PM' },
];

export const DINING_MENU: MenuItem[] = [
  { id: 'bk-oats', section: 'breakfast', group: 'Grab & Go', name: 'Overnight Protein Oats', description: 'greek yogurt, fresh fruit, vital protein collagen', price: '$8.00' },
  { id: 'bk-fruit', section: 'breakfast', group: 'Grab & Go', name: 'Seasonal Fruit Cup', price: '$7.00' },
  { id: 'bk-eggs', section: 'breakfast', group: 'Grab & Go', name: 'Hard Boiled Eggs', price: '$5.50' },
  { id: 'bk-bites', section: 'breakfast', group: 'Grab & Go', name: 'Raw Protein Bites', description: 'dates, walnuts, almonds, vital protein collagen, coco powder, maple syrup, almond butter, vanilla, sea salt, shredded coconut', price: '$7.00' },
  { id: 'bk-mezze', section: 'breakfast', group: 'Grab & Go', name: 'Mezze Box', description: 'cucumbers, celery, carrots, pita, hummus & labneh', price: '$7.00' },
  { id: 'bk-protein-pack', section: 'breakfast', group: 'Grab & Go', name: 'Eagle Protein Pack', description: 'hobb\'s turkey, cheese, fresh fruit, pita', price: '$9.00' },
  { id: 'bk-glow', section: 'breakfast', group: 'Made to Order', name: 'Strawberry Glow Smoothie', description: 'strawberries, banana, avocado, dates, vital protein collagen, sea moss, hyaluronic acid, maple syrup, strawberry glaze, almond milk, organic coconut crème', price: '$12.00' },
  { id: 'bk-creatine', section: 'breakfast', group: 'Made to Order', name: 'Creatine Berry Protein Smoothie', description: 'banana, raspberries, almond butter, chocolate protein powder, cymbiotika creatine, maple syrup, dates, cacao powder, toffee stevia, vanilla extract, almond milk', price: '$12.00' },
  { id: 'bk-scramble', section: 'breakfast', group: 'Made to Order', name: 'Eagle Scramble', description: 'eggs, ricotta, country sourdough', price: '$9.00' },
  { id: 'bk-avo-toast', section: 'breakfast', group: 'Made to Order', name: 'Avocado Toast', description: 'chopped avocado, cream cheese, chili flakes, lemon zest, cilantro, chili oil, smoked sea salt', price: '$10.00' },
  { id: 'bk-quesadilla', section: 'breakfast', group: 'Made to Order', name: 'Breakfast Quesadilla', description: 'eggs, crispy bacon, smashed avocado, pepper jack cheese, pico de gallo', price: '$11.00' },
  { id: 'bk-burrito', section: 'breakfast', group: 'Made to Order', name: 'SM Burrito', description: 'eggs, bacon, tillamook cheddar, crispy potatoes, chipotle aioli', price: '$11.00' },
  { id: 'bk-bagel', section: 'breakfast', group: 'Made to Order', name: 'Eagle Bagel', description: 'everything bagel, fried egg, bacon, tillamook cheddar, chipotle aioli', price: '$12.00' },
  { id: 'bk-bagel-cc', section: 'breakfast', group: 'Made to Order', name: 'Bagel with Cream Cheese & Butter', description: 'ask for our bagel options', price: '$5.00' },
  { id: 'ln-buffalo', section: 'lunch', group: 'Cold Items', name: 'Buffalo Chicken Salad', description: 'iceberg lettuce, crunchy or grilled chicken, tomatoes, cucumber, shredded cheese, bacon, avocado, ranch & buffalo sauce', price: '$9.75' },
  { id: 'ln-caesar', section: 'lunch', group: 'Cold Items', name: 'Chicken Caesar Salad or Wrap', description: 'romaine, grilled chicken, parmesan cheese, croutons, caesar dressing', price: '$9.75' },
  { id: 'ln-turkey', section: 'lunch', group: 'Cold Items', name: 'Turkey Sandwich', description: 'turkey, tomato, lettuce, mayo, sourdough or squaw bread, miss vickies chips', price: '$9.75' },
  { id: 'ln-acai', section: 'lunch', group: 'Cold Items', name: 'Acai Bowl', description: 'acai, mixed berries, bananas, granola, honey', price: '$9.75' },
  { id: 'ln-steak-q', section: 'lunch', group: 'Hot Items', name: 'Steak Quesadilla', description: 'steak, cheese, caramelized onions, guacamole, pico de gallo', price: '$10.00' },
  { id: 'ln-cheese-q', section: 'lunch', group: 'Hot Items', name: 'Cheese Quesadilla', price: '$5.00' },
  { id: 'ln-pastor', section: 'lunch', group: 'Hot Items', name: 'Al Pastor Burrito', description: 'seasoned pork, cheese, rice, beans, pico de gallo, green salsa', price: '$9.50' },
  { id: 'ln-brc', section: 'lunch', group: 'Hot Items', name: 'BRC Burrito', description: 'beans, rice, cheese', price: '$6.00' },
  { id: 'ln-eagle-bowl', section: 'lunch', group: 'Hot Items', name: 'Eagle Bowl', description: 'chicken or steak, rice, beans, cheese, onions, cilantro, pico de gallo', price: '$9.75 / $11.00' },
  { id: 'ln-alfredo', section: 'lunch', group: 'Hot Items', name: 'Chicken Fettuccine Alfredo', description: 'grilled chicken, fettuccine, parmesan cheese, alfredo sauce', price: '$9.75' },
  { id: 'ln-spaghetti', section: 'lunch', group: 'Hot Items', name: 'Spaghetti & Meatballs', price: '$10.00' },
  { id: 'ln-burger', section: 'lunch', group: 'Hot Items', name: 'SM Burger & Fries', description: '1/4 lb all-beef patty, cheese, lettuce, tomato, thousand island dressing', price: '$11.00' },
  { id: 'ln-tenders', section: 'lunch', group: 'Hot Items', name: 'Chicken Tenders & Fries', price: '$9.75' },
  { id: 'ln-teriyaki', section: 'lunch', group: 'Hot Items', name: 'Teriyaki Chicken Bowl', description: 'grilled teriyaki chicken, rice, veggies, teriyaki sauce', price: '$9.75' },
  { id: 'ln-loaded-fries', section: 'lunch', group: 'Hot Items', name: 'Loaded Fries', description: 'fries, cheese sauce, pico de gallo, sour cream', price: '$8.00' },
  { id: 'ln-nachos', section: 'lunch', group: 'Hot Items', name: 'Chili Cheese Nachos', description: 'beef chili, cheese, sour cream, house-made corn tortilla chips', price: '$9.00' },
  { id: 'ln-curly', section: 'lunch', group: 'Sides', name: 'Curly Fries', price: '$6.00' },
  { id: 'ln-pickle', section: 'lunch', group: 'Sides', name: 'Pickle Fries', price: '$8.00' },
  { id: 'el-oats', section: 'elite', group: 'Grab & Go', name: 'Overnight Protein Oats', description: 'greek yogurt, fresh fruit, vital protein collagen', price: '$8.00' },
  { id: 'el-fruit', section: 'elite', group: 'Grab & Go', name: 'Seasonal Fruit Cup', price: '$7.00' },
  { id: 'el-eggs', section: 'elite', group: 'Grab & Go', name: 'Hard Boiled Eggs', price: '$5.50' },
  { id: 'el-balls', section: 'elite', group: 'Grab & Go', name: 'Protein Raw Balls', description: 'dates, walnuts, almonds, vital protein collagen, coco powder, maple syrup, almond butter, vanilla, sea salt, shredded coconut', price: '$7.00' },
  { id: 'el-mezze', section: 'elite', group: 'Grab & Go', name: 'Mezze Box', description: 'cucumbers, celery, carrots, pita, hummus & labneh', price: '$7.00' },
  { id: 'el-protein-pack', section: 'elite', group: 'Grab & Go', name: 'Eagle Protein Pack', description: 'hobb\'s turkey, cheese, fresh fruit, pita', price: '$9.00' },
  { id: 'el-glow', section: 'elite', group: 'Made to Order', name: 'Strawberry Glow Smoothie', description: 'strawberries, banana, avocado, dates, vital protein collagen, sea moss, hyaluronic acid, maple syrup, strawberry glaze, almond milk, organic coconut crème', price: '$12.00' },
  { id: 'el-creatine', section: 'elite', group: 'Made to Order', name: 'Creatine Berry Protein Smoothie', description: 'banana, raspberries, almond butter, chocolate protein powder, cymbiotika creatine, maple syrup, dates, cacao powder, toffee stevia, vanilla extract, almond milk', price: '$12.00' },
  { id: 'el-wrap', section: 'elite', group: 'Made to Order', name: 'Turkey Avocado Wrap', description: 'whole wheat tortilla, hobb\'s turkey, avocado, lettuce, chipotle aioli', price: '$9.50' },
  { id: 'el-buddha', section: 'elite', group: 'Made to Order', name: 'Buddha Bowl', description: 'grilled chicken, brown rice, mixed vegetables, avocado, hummus, sriracha aioli', price: '$10.00' },
  { id: 'el-taco-bowl', section: 'elite', group: 'Made to Order', name: 'SM Taco Bowl', description: 'grilled chicken, steak, or al pastor with spanish rice, beans, mixed vegetables, chipotle aioli', price: '$10.00' },
  { id: 'el-stirfry', section: 'elite', group: 'Made to Order', name: 'Stir-Fry Bowl', description: 'steak, brown rice, broccoli, teriyaki sauce', price: '$10.00' },
  { id: 'el-pasta', section: 'elite', group: 'Made to Order', name: 'Protein Pasta', description: 'grilled chicken, mixed veggies, pink sauce with protein pasta', price: '$10.00' },
];
