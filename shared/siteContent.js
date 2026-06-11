import { localAttractionsDiningSections } from './localAttractionsDining.js'
import { migratedSnapshotContent } from './migratedSnapshotContent.js'

const primaryNavItems = [
  { label: 'HOME', path: '/', matchPaths: ['/'] },
  { label: 'ABOUT', path: '/about-us', matchPaths: ['/about-us'] },
  {
    label: 'HOUSES',
    path: '/st-john-rentals',
    matchPaths: ['/st-john-rentals', '/for-rent', '/for-sale', '/property-for-sale', '/rental-properties'],
    children: [
      { label: 'Rental Accommodations', path: '/for-rent', matchPaths: ['/for-rent'] },
      { label: 'Property For Sale', path: '/property-for-sale', matchPaths: ['/for-sale', '/property-for-sale'] },
    ],
  },
  {
    label: 'TRANSPORTATION',
    path: '/car-barge-information',
    matchPaths: ['/car-barge-information', '/passenger-ferry', '/ferrys', '/cars'],
    children: [
      {
        label: 'Car Barge Information',
        path: '/car-barge-information',
        matchPaths: ['/car-rental-ferry-boat-info', '/car-barge-information'],
      },
      { label: 'Passenger Ferry', path: '/passenger-ferry', matchPaths: ['/passenger-ferry', '/ferrys'] },
      { label: 'St John Car Rentals', path: '/cars', matchPaths: ['/cars'] },
    ],
  },
  {
    label: 'ACTIVITIES',
    path: '/map',
    matchPaths: ['/map', '/boats', '/charter-boat-rentals'],
    children: [
      { label: 'Charter Boats', path: '/boats', matchPaths: ['/boats', '/charter-boat-rentals'] },
      { label: 'Local Attractions', path: '/map', matchPaths: ['/map'] },
    ],
  },
  { label: 'ADVERTISE', path: '/advertise', matchPaths: ['/advertise'] },
]

const legalNavItems = [
  { label: 'PRIVACY POLICY', path: '/privacy-policy', matchPaths: ['/privacy-policy'] },
  { label: 'TERMS OF AGREEMENT', path: '/terms-of-agreement', matchPaths: ['/terms-of-agreement'] },
]

const carRentalCompanies = [
  { name: 'C & C', website: 'http://www.cccarrental.com/', phones: ['340-693-8164'] },
  { name: 'Courtesy', website: 'https://www.courtesycarrental.com/', phones: ['340-776-6650'] },
  { name: "O'Connor", website: 'http://www.oconnorcarrental.com/', phones: ['340-776-6343'] },
  { name: 'L&L Jeep Rental', website: 'http://www.bookajeep.com/', phones: ['340-776-1120'] },
  { name: 'Mr. Pipers Jeeps', website: 'https://mrpipersjeeps.com/', phones: ['340-693-7580'] },
  { name: 'St John Car Rental', website: 'https://www.stjohncarrental.com/', phones: ['340-776-6103'] },
  { name: 'Aqua Blue Car Rental', website: 'http://www.aquablucarrental.com/', phones: ['340-776-2782'] },
  { name: 'Sunshine Jeep Rental', website: 'http://www.sunshinesjeeprental.com/', phones: ['340-690-1786'] },
  { name: "Penn's Jeep Rental, Inc.", phones: ['340-776-6530'] },
  {
    name: 'Cool Breeze Jeep & Car Rental',
    website: 'http://www.coolbreezecarrental.com/stjohn_vehicles_rates.htm',
    phones: ['340-776-6588'],
  },
  {
    name: 'Delbert Hill Car and Jeep Rental',
    website: 'http://delberthillcarrental.com/',
    phones: ['340-776-6637'],
  },
  { name: 'Cruz Bay Car Rentals', website: 'https://cruzbaycarrental.com/', phones: ['340-227-0138', '340-626-4552'] },
  {
    name: "Spencer's Jeep Rental",
    website: 'http://www.stjohntraveler.com/usvi/transportation/spencers-jeeps/',
    phones: ['340-693-8784', '888-776-6628'],
    separator: ' or ',
  },
]

const featuredRentalListings = [
  {
    name: 'Arco Iris',
    path: '/rental-properties/arco-iris',
    summary: 'Max 6 Guests 3 Bedrooms 3.5 Baths Pool Internet Point Rendezvous',
    image: {
      kind: 'image',
      url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fproperties%2Farco-iris%2Farco-iris-hero.avif?alt=media&token=ec411415-ad16-47a8-be9b-fb2036ba7ed0',
      alt: 'Available Rentals',
      title: '',
    },
  },
  {
    name: 'Beyond the Sea',
    path: '/rental-properties/beyond-the-sea',
    summary: 'Max 6 Guests 3 Bedrooms 3.5 Baths Pool Internet Maria Bluff',
    image: {
      kind: 'image',
      url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fproperties%2Fbeyond-the-sea%2Fbeyond-the-sea-hero.avif?alt=media&token=6f1fe7eb-be33-444c-837c-e031e3c79f12',
      alt: 'Available Rentals',
      title: '',
    },
  },
  {
    name: 'Coral Sky Villa',
    path: '/rental-properties/coral-sky-villa',
    summary: 'Max 8 Guests 4 Bedrooms 3.5 Baths Pool Internet Upper Carolina',
    image: {
      kind: 'image',
      url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fproperties%2Fcoral-sky-villa%2Fcoral-sky-villa-hero.jpg?alt=media&token=9f5c19d0-e155-4982-b897-3423cada1036',
      alt: 'Available Rentals',
      title: '',
    },
  },
  {
    name: 'Notre Ciel',
    path: '/rental-properties/notre-ciel',
    summary: 'Max 7 Guests 2 Bedrooms + Loft 2 Baths Pool Hot Tub Internet Mamey Peak',
    image: {
      kind: 'image',
      url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fproperties%2Fnotre-ciel%2Fnotre-ciel-hero.png?alt=media&token=65e7fd77-277c-4c1a-a0b0-075c7833277e',
      alt: 'Available Rentals',
      title: '',
    },
  },
  {
    name: 'Sol La Vie',
    path: '/rental-properties/sol-la-vie',
    summary: 'Max 4 Guests 2 Bedrooms 2 Baths Pool Internet Coral Bay',
    image: {
      kind: 'image',
      url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fproperties%2Fsol-la-vie%2Fsol-la-vie-hero.jpg?alt=media&token=b8166184-4531-411a-94c9-7dc8620d2fd6',
      alt: 'Available Rentals',
      title: '',
    },
  },
  {
    name: 'The Little Easy',
    path: '/rental-properties/the-little-easy',
    summary: 'Max 4 Guests 1 Bedroom + Loft 2 Baths Internet Coral Bay',
    image: {
      kind: 'image',
      url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fproperties%2Fthe-little-easy%2Fthe-little-easy-hero.png?alt=media&token=8884dcd1-becc-4e73-98c7-61a986bf6b75',
      alt: 'Available Rentals',
      title: '',
    },
  },
]


function createRichContentPage({ key, path, navLabel, group, title = '', contentModel = 'rich-content-page' }) {
  const content = migratedSnapshotContent[key] ?? {}

  return {
    key,
    path,
    navLabel,
    title: title || content.h1 || navLabel,
    group,
    source: 'structured',
    contentModel,
    metaDescription: content.metaDescription ?? '',
    bodyHtml: content.bodyHtml ?? '',
    imageGallery: Array.isArray(content.imageGallery) ? content.imageGallery : [],
  }
}

const structuredSitePages = {
  home: {
    key: 'home',
    path: '/',
    navLabel: 'Home',
    group: 'marketing',
    source: 'structured',
    contentModel: 'home',
    hero: {
      titleLines: ['Welcome to St. John', 'House Rentals'],
      lead: 'Find the perfect vacation home for your next island adventure.',
      image: {
        kind: 'image',
        url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fpages%2Fhome%2Fhome-hero.png?alt=media&token=deba52c2-f3ce-42e7-85e5-db2e42bf4819',
        alt: 'Trunk Bay view across bright blue water on St. John',
      },
    },
    directory: {
      title: 'Searching for a private Caribbean villa for your next escape?',
    },
    trust: {
      eyebrow: 'Why Choose Us',
      title: "We've been a trusted St. John business for over 25 years!",
      lead:
        "St. John House Rentals has been connecting islanders and visitors since 1999. We operate exclusively on St. John. If you're looking for a way to support locals, you've found it!",
      action: { label: 'Browse Rentals', path: '/st-john-rentals' },
      image: {
        kind: 'image',
        url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fpages%2Fhome%2Fhome-trust.jpg?alt=media&token=c5ad7fd6-0243-4d4f-b34e-50945dd03e50',
        alt: 'Pink plumeria flowers overlooking St. John waters',
      },
    },
    discover: {
      title: 'Discover the magic and beauty of St. John in the U.S. Virgin Islands',
      image: {
        kind: 'image',
        url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fpages%2Fhome%2Fhome-discover.png?alt=media&token=997b2fb4-cc2f-490b-8f0f-103e7f42cf35',
        alt: 'St. John bay collage with coastal views and boats',
      },
      features: [
        {
          kind: 'selection',
          title: 'Wide Selection of Properties',
          body: 'From cozy vacation rentals to luxurious homes for sale, we offer properties that suit every need and budget.',
        },
        {
          kind: 'deals',
          title: 'Special Deals',
          body: 'Take advantage of our exclusive offers and limited-time specials to get the best value for your stay or purchase.',
        },
        {
          kind: 'local',
          title: 'GO Local',
          body:
            "We understand St. John like no one else. Our knowledge of the island helps us provide valuable recommendations for your stay, whether it's for property, charter boats, or car rentals.",
        },
        {
          kind: 'service',
          title: 'Reliable Customer Service',
          body: "While we don't handle bookings directly, we connect you with trusted rental and property partners.",
        },
      ],
    },
    about: {
      title: 'ABOUT ST. JOHN HOUSE RENTALS',
      bodyIntro:
        "Our homes are owned or run by a number of individuals and management companies, and they all do their own booking. The email link on each home's page will get you directly to the person who can help! We at ",
      bodyLink: { href: 'http://stjohnlinks.com/', label: 'stjohnhouserentals.com' },
      bodyOutro: ' do not handle bookings.',
      image: {
        kind: 'image',
        url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fpages%2Fhome%2Fhome-about.jpg?alt=media&token=251a8760-5858-4249-a62c-c9bfe02f5636',
        alt: 'Pool deck overlooking villa and turquoise ocean at Still Waters Villa',
      },
    },
  },
  aboutUs: {
    key: 'aboutUs',
    path: '/about-us',
    navLabel: 'About',
    group: 'marketing',
    source: 'structured',
    contentModel: 'about',
    hero: {
      title: 'Celebrating 25 years this season!',
      image: {
        kind: 'image',
        url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fpages%2Faboutus%2Faboutus-hero.jpg?alt=media&token=7bc1d18d-a679-4d8d-855c-5de87373aef5',
        alt: 'Anaberg ruins overlooking St. John waters',
      },
    },
    story: {
      kicker: 'About Us',
      title: 'St. John House Rentals is owned and run by Jean "Mean Jean" Vance',
      leadParagraphs: [
        "If you're a long-time visitor to St. John, you may remember her from her bartending days at the famous Skinny Legs Bar and Grill.",
        "It was back in those days-in 1999, when the internet first came to Coral Bay-that Mean Jean and her friend Andy Gordon started a website called St. John Links, designed to give intrepid travelers a little info about how to vacation on the sleepy side of the island. Andy was a tech whiz with a neuromuscular disease that caused his fingers to stop working. Mean Jean was, literally, his right hand, moving the computer mouse and doing the typing.",
      ],
      bodyParagraphs: [
        "The site started with just a handful of rentals and the idea was simple: connect vacationers directly with property owners looking to rent out their homes. No fuss. No fees. No middleman. If you saw a house you liked, you could contact the homeowner directly and book. The homeowner would give a percentage to St. John Links. And-in the true Coral Bay fashion-it was all done on the honor system.",
        'People liked this idea. The business grew. In 2004 St. John Links added St. John House Rentals to accommodate the demand. Today, the site is going strong, giving you an easy way to connect directly with dozens of St. John property owners.',
        "If you're looking for the best way to support local, you've found it. As for Mean Jean, she's no longer behind the bar at Skinny's but she's still on the island, still exploring all the hidden beauties of her home, and still doing one of those things that makes St. John such a magical place: making connections.",
      ],
      image: {
        kind: 'image',
        url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fpages%2Faboutus%2Faboutus-story.jpg?alt=media&token=3494daf7-551f-4342-bd4f-417ba7b120ab',
        alt: 'Parrotfish swimming in clear Caribbean water',
      },
    },
    essentials: {
      kicker: 'Essentials',
      title: 'We believe that finding the right home',
      lead:
        "is essential to making your stay unforgettable. Whether you're visiting for a week or planning an extended stay, we have a home for you. From cozy cottages to spacious villas, we offer properties in some of the most desirable locations on St. John, giving you access to pristine beaches, hiking trails, and breathtaking views.",
      image: {
        kind: 'image',
        url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fpages%2Faboutus%2Faboutus-essentials.jpg?alt=media&token=8388e264-7073-4971-b6eb-61e871feb300',
        alt: 'Pool deck overlooking villa and turquoise ocean',
      },
    },
  },
  houseRentals: {
    key: 'houseRentals',
    path: '/st-john-rentals',
    navLabel: 'House Rentals',
    title: 'House Rentals',
    group: 'houses',
    source: 'structured',
    contentModel: 'house-rentals',
    intro: {
      eyebrow: 'House Rentals',
      title: 'Are you looking for private vacation villas in the Caribbean?',
      lead: 'Explore our diverse selection of rental homes and find the perfect fit.',
      paragraphs: [
        'Accommodations on St. John, with beautiful views, cool breezes, and peaceful sounds of the ocean?',
        'St. John, in the Virgin Islands, has some of the most charming and unique vacation home rentals in the Caribbean. Browse the current property catalog below and contact owners directly from each listing page.',
      ],
    },
    directory: {
      title: 'Available House Rentals',
      actionLabel: 'View Property',
    },
  },
  advertise: {
    key: 'advertise',
    path: '/advertise',
    navLabel: 'Advertise',
    group: 'marketing',
    source: 'structured',
    contentModel: 'advertise',
    hero: {
      title: 'Advertise on St. John House Rentals',
      image: {
        kind: 'image',
        url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fpages%2Fadvertise%2Fadvertise-hero.jpg?alt=media&token=e2111aff-9253-46b1-969d-d2a7a4ff6836',
        alt: 'Sunlight reflecting across calm blue water',
      },
    },
    contact: {
      title: 'Advertising Your Property',
      subtitle: 'Get in Touch with Our Team',
      bodyParagraphs: [
        "Do you own or manage a property on St. John? Advertise your St John villa, timeshare, or Bed and Breakfast with St John's oldest vacation rentals site.",
        'We offer a flat-rate annual subscription for each listing. We do the work for you. All changes are free. NO commissions on bookings!',
      ],
      bookingNotice: 'VISITORS TO ST JOHN - THIS IS NOT FOR BOOKING INQUIRIES.',
      bookingHelpParts: {
        before: 'If you are interested in information on or booking a villa, please, ',
        emphasis: 'communicate directly with St John Owners/Managers',
        after:
          ' from the page of each vacation rental home of interest. The email link or phone number on each vacation rental page will get you directly to the person who can help!',
      },
      contactTitle: 'Contact Us',
      contactLines: [{ label: 'Email', value: 'stjohnlinks@gmail.com', href: 'mailto:stjohnlinks@gmail.com' }],
    },
    form: {
      fields: [
        { id: 'firstName', label: 'Your First Name', name: 'firstName', placeholder: 'enter your first name', type: 'text' },
        { id: 'lastName', label: 'Your Last Name', name: 'lastName', placeholder: 'enter your last name', type: 'text' },
        { id: 'email', label: 'Your Email', name: 'email', placeholder: 'enter your email', type: 'email' },
        { id: 'subject', label: 'Subject', name: 'subject', placeholder: 'enter your subject', type: 'text' },
      ],
      messageField: {
        id: 'message',
        label: 'Your Message',
        name: 'message',
        placeholder: 'enter your message',
        rows: 6,
      },
      submitLabel: 'Send Message',
    },
  },
  localAttractions: {
    key: 'localAttractions',
    path: '/map',
    navLabel: 'Local Attractions',
    group: 'activities',
    source: 'structured',
    contentModel: 'local-attractions',
    hero: {
      title: 'Local Attractions',
      tagline: 'From Beaches to Restaurants - Find It Here!',
      image: {
        kind: 'image',
        url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fpages%2Flocalattractions%2Flocalattractions-hero.avif?alt=media&token=5275200b-c751-415a-84e5-91ad25e1da68',
        alt: 'Trunk Bay viewed from above with turquoise water and white sand',
      },
    },
    map: {
      image: {
        kind: 'image',
        url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fpages%2Flocalattractions%2Flocalattractions-map.png?alt=media&token=a6a0b19b-ce5a-48f9-b057-b5446e004b06',
        alt: 'Virgin Islands National Park map of St. John',
      },
      action: { label: 'View Full Map' },
    },
    intro: {
      title: 'Where do you want to spend your day?',
      paragraphs: [
        'The National Park Service map above has the major features and routes you need to plan which beaches and hiking trails will be closest as you pick your perfect accommodations.',
      ],
    },
    dining: {
      title: 'St. John Restaurants',
      sections: localAttractionsDiningSections,
    },
  },
  propertyForSale: {
    key: 'propertyForSale',
    path: '/property-for-sale',
    navLabel: 'Property For Sale',
    group: 'houses',
    source: 'structured',
    contentModel: 'property-for-sale',
    hero: {
      title: 'Property For Sale',
      image: {
        kind: 'image',
        url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fpages%2Fpropertyforsale%2Fpropertyforsale-hero.avif?alt=media&token=8c2734aa-696a-4f13-bcfc-50c25e37e196',
        alt: 'Sunny St. John ridge with bay views',
      },
    },
    story: {
      title: 'St John Virgin Islands',
      paragraphs: [
        "If you've ever vacationed in an exotic location and wished you could stay forever, you're not alone. Although it might seem unattainable, owning a piece of the rock can be your reality.",
        'St. John is rich with history and culture. One of the most attractive aspects of St. John is the Virgin Islands National Park, which Laurance Rockefeller helped to establish in 1956. Since then, the VINP on St. John has grown to 7,200 acres plus 5,600 underwater acres. This equates to approximately 80 percent of the island remaining untouched, including pristine white sand beaches.',
      ],
      image: {
        kind: 'image',
        url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fpages%2Fpropertyforsale%2Fpropertyforsale-story.avif?alt=media&token=9ade4a4f-d678-4217-9e5d-c2cafb343a53',
        alt: 'Stone tower and tropical plants overlooking St. John waters',
      },
    },
    details: {
      paragraphs: [
        'Visitors are attracted to this small island from all walks of life and from every part of the globe. Visitors and residents alike enjoy hiking trails, swimming, surfing, snorkeling, scuba diving, and sailing, along with an array of other outdoor activities.',
        'Regardless of your budget, the brokers and sales agents of 340 Real Estate Co. can show and sell all the properties that are on the MLS whether it be Commercial properties, Residential homes, Land, or Condos. We have an up to date comprehensive online database of all the properties for sale on the St John Board of Realtors MLS as well as a database of St John Real Estate Sales History, including MLS Homes, Land, and Condos sold on St John since 2009!',
        'Whether it be for a week or a lifetime, contact us today and let us put our collective 50-plus years of real estate experience to work, helping you realize your dream of owning a piece of St John.',
      ],
      image: {
        kind: 'image',
        url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fpages%2Fpropertyforsale%2Fpropertyforsale-details.avif?alt=media&token=15aa6127-d86e-421c-9e1a-8c68eaa00099',
        alt: 'Cruz Bay shoreline and sky',
      },
      contact: {
        name: 'Tammy Donnelly',
        role: 'VI Licensed Real Estate Broker / Owner',
        website: { href: 'http://www.340realestateco.com', label: 'www.340realestateco.com' },
        phone: '340-643-6068',
      },
    },
  },
  rentalAccommodations: {
    key: 'rentalAccommodations',
    path: '/for-rent',
    navLabel: 'Rental Accommodations',
    group: 'houses',
    source: 'structured',
    contentModel: 'rental-accommodations',
    hero: {
      title: 'Rental Accommodations',
      image: {
        kind: 'image',
        url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fpages%2Frentalaccommodations%2Frentalaccommodations-hero.jpg?alt=media&token=06e1b0bf-e354-4f0d-8e5f-bd3b11842cb8',
        alt: 'Seaside neighborhood on St. John',
      },
    },
    directory: {
      title: 'Available Properties',
      filterPlaceholder: 'Filter by number of bedrooms',
      filterActionLabel: 'View Available Rentals',
      emptyStateAll: 'No rentals are available right now.',
      emptyStateUnavailable: 'Rental summaries are unavailable right now.',
      featuredListings: featuredRentalListings,
    },
  },
  carBargeInformation: {
    key: 'carBargeInformation',
    path: '/car-barge-information',
    navLabel: 'Car Barge Information',
    group: 'travel',
    source: 'structured',
    contentModel: 'car-barge-information',
    hero: {
      title: 'Car Barge Information',
      image: {
        kind: 'image',
        url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fpages%2Fcarbargeinformation%2Fcarbargeinformation-hero.avif?alt=media&token=a2bb10f2-1cf4-4b7c-b38a-8e6cd3a34f7f',
        alt: 'Car barges lined up at the dock',
      },
    },
    intro: {
      portAuthorityFees: [
        { label: 'Small Vehicles', value: '$3' },
        { label: 'Large Vehicles', value: '$4' },
      ],
      leftParagraphs: [
        'Before you get onto the car barge heading to St. John, in Red Hook, make sure to stop at the small booth at the entrance to pay the Port Authority Fee.',
        'Get your ticket and drive into the large parking lot. An employee will guide you to your parking spot. You will wait in this spot until it is your turn to load onto the barge.',
        'When you are called by the barge employee, note that you must back your vehicle onto the barge.',
      ],
      rightParagraphs: [
        'One-way or round-trip tickets are purchased after you are on the barge. Tickets are not interchangeable between the three car barge companies. If you purchase a round-trip ticket, it is only good for the company that issued it.',
        'The Red Hook ferry location services both passenger ferries and car barges at separate well-marked entrances. Arrive as early as possible before the car barge departure time you hope to catch. It fills up fast.',
      ],
      referenceLink: {
        href: 'https://www.vinow.com/stjohn/getting_there/car-ferry-st-thomas-and-st-john/',
        label: 'Link for information is here.',
      },
    },
    operators: [
      {
        title: 'LOVE CITY CAR FERRIES',
        meta: {
          names: 'M/V Grand Vic and M/V Capt Vic',
          phone: '(340) 779-4000',
          travelTime: '30 minutes',
        },
        image: {
          kind: 'image',
          url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fpages%2Fcarbargeinformation%2Fcarbargeinformation-operators-0.avif?alt=media&token=34b89e1d-072e-499f-a8f5-6bcc9da8ed2b',
          alt: 'Love City car ferry',
        },
        schedules: [
          {
            title: 'Monday-Friday',
            columns: [
              {
                heading: 'Enighed Pond (St. John) -> Red Hook (St. Thomas)',
                times: ['**6:15 AM - *6:30 AM', '8:00 AM - 8:30 AM', '10:00 AM - 10:30 AM', 'Noon - 12:30 PM', '2:00 PM - 2:30 PM', '4:00 PM - *4:30 PM', '6:15 PM - *6:30 PM'],
              },
              {
                heading: 'Red Hook (St. Thomas) -> Enighed Pond (St. John)',
                times: ['**7:00 AM - *7:30 AM', '9:00 AM - 9:30 AM', '11:00 AM - 11:30 AM', '1:00 PM - 1:30 PM', '3:00 PM - 3:30 PM', '5:00 PM - *5:30 PM', '7:00 PM - *7:30 PM'],
              },
            ],
            notes: ['*Seasonal', '**Not on Weekends or Holidays'],
          },
          {
            title: 'Saturday-Sunday & Holidays',
            columns: [
              {
                heading: 'Enighed Pond (St. John) -> Red Hook (St. Thomas)',
                times: ['8:00 AM', '10:00 AM', 'Noon', '2:00 PM', '4:00 PM', '6:15 PM'],
              },
              {
                heading: 'Red Hook (St. Thomas) -> Enighed Pond (St. John)',
                times: ['9:00 AM', '11:00 AM', '1:00 PM', '3:00 PM', '5:00 PM', '7:00 PM'],
              },
            ],
          },
        ],
        rates: {
          heading: 'LOVE CITY CAR FERRY RATES',
          rows: [
            { label: 'One-way', values: ['$65'] },
            { label: 'Round Trip', values: ['$80'] },
          ],
          footer: ['Last Updated: 4/13/2026'],
          url: 'https://www.lovecitycarferries.com/',
        },
      },
      {
        title: 'BIG RED BARGE CO.',
        meta: {
          names: 'M/V Todd G. and M/V Virginia Pride',
          phone: '(340) 227-0918',
          travelTime: '30 minutes',
        },
        image: {
          kind: 'image',
          url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fpages%2Fcarbargeinformation%2Fcarbargeinformation-operators-1.avif?alt=media&token=33e262d8-d589-4065-b91c-6f5e5c64202e',
          alt: 'Big Red Barge',
        },
        schedules: [
          {
            title: 'Monday-Sunday',
            columns: [
              {
                heading: 'Departing from Cruz Bay, St. John:',
                times: ['6:00 AM', '7:30 AM', '9:30 AM', '11:30 AM', '1:30 PM', '3:30 PM', '5:30 PM'],
              },
              {
                heading: 'Departing from Red Hook, St. Thomas:',
                times: ['6:30 AM', '8:30 AM', '10:30 AM', '12:30 PM', '2:30 PM', '4:30 PM', '6:30 PM'],
              },
            ],
          },
        ],
        rates: {
          heading: 'BIG RED BARGE CO. RATES',
          rows: [
            { label: 'One-way', values: ['$65', '$15'] },
            { label: 'Round Trip', values: ['$80', '$25'] },
            { label: '', values: ['$60'] },
          ],
          footer: ['Last Updated: 4/13/2026', '*Must show a valid US Virgin Islands ID'],
          url: 'https://www.bigredbarge.co/',
        },
      },
    ],
    note:
      'Note: about St. Thomas-St. John Car Barge Rates: All rates included above are for cars, small trucks, and SUVs, unless otherwise stated. Other types of vehicles, including commercial vehicles, should call the barge companies to discuss rates and fees for your particular needs.',
  },
  passengerFerry: {
    key: 'passengerFerry',
    path: '/passenger-ferry',
    navLabel: 'Passenger Ferry',
    group: 'travel',
    source: 'structured',
    contentModel: 'passenger-ferry',
    routeAliases: ['/ferrys'],
    hero: {
      image: {
        kind: 'image',
        url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fpages%2Fpassengerferry%2Fpassengerferry-hero.jpg?alt=media&token=2a860234-4af4-4299-8758-cdbe77d5cbd7',
        alt: 'Passenger ferries docked in Cruz Bay',
        title: 'passenger-ferry-harbor.jpg',
      },
    },
    redHook: {
      titleLines: ['Passenger Ferry Schedule', 'St. Thomas - St. John', 'Red Hook Ferry', 'Red Hook, St. Thomas - Cruz Bay, St. John'],
      meta: ['Operated by: Transportation Services and Varlack Ventures', 'Telephone: (340) 776-6282 and (340) 776-6412', 'Travel Time: 15 minutes'],
      directions: [
        {
          heading: 'Red Hook -> Cruz Bay',
          times: ['5:30 am (M-F)', '6:30 AM', '7:30 AM', '8:30 AM', '9:00 AM', '10:00 AM', '11:00 AM', 'Noon', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM', '10:00 PM', '11:00 PM', '11:30 PM'],
          chunkSize: 8,
        },
        {
          heading: 'Cruz Bay -> Red Hook',
          times: ['6:30 AM', '7:30 AM', '8:30 AM', '9:00 AM', '10:00 AM', '11:00 AM', 'Noon', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM', '10:00 PM', '11:00 PM'],
          chunkSize: 8,
        },
      ],
      rates: {
        title: 'Red Hook - Cruz Bay Ferry Rates',
        lines: [
          'Adult (Non-Resident) One-way - $8.15',
          'Adult (Resident*) One-way - $6.00',
          'Senior (Resident*) One-way - $1.50',
          'Child (2-11) One-way $1.00',
          'Infants (under 2 years) - FREE',
          'Luggage/Box - $4.00 each',
          '* Valid USVI ID required for resident rates.',
          'Last Updated: 11/22/2023',
        ],
      },
    },
    crownBay: {
      title: 'Crown Bay Ferry',
      routeLine: '(Route: Crown Bay, St. Thomas to Cruz Bay, St. John)',
      meta: [
        'Operated by: Inter Island Boat Services',
        'Telephone: (340) 776-6597',
        'St. Thomas Ferry Landing: Crown Bay Marina',
        'St. John Ferry Landing: Victor William Sewer Marine Facility (AKA: The Creek)',
        'Travel Time: 35 minutes',
        'Note: Check-in is 30 minutes prior to departure time.',
      ],
      directions: [
        {
          heading: 'Crown Bay -> Cruz Bay',
          times: ['9:45 AM (Fri, Sat & Sun)', '2:15 PM (Fri, Sat & Sun)', '3:30 PM', '5:30 PM'],
          chunkSize: 1,
        },
        {
          heading: 'Cruz Bay -> Crown Bay',
          times: ['8:30 AM (Fri, Sat & Sun)', '11:00 AM', '1:15 PM (Fri, Sat & Sun)', '4:15 PM'],
          chunkSize: 1,
        },
      ],
    },
  },
  stJohnCarRentals: {
    key: 'stJohnCarRentals',
    path: '/cars',
    navLabel: 'St John Car Rentals',
    group: 'travel',
    source: 'structured',
    contentModel: 'st-john-car-rentals',
    hero: {
      title: 'St John Car Rentals',
      tagline: 'Rent a car to explore all that St. John has to offer',
      image: {
        kind: 'image',
        url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fpages%2Fstjohncarrentals%2Fstjohncarrentals-hero.avif?alt=media&token=4bd63aca-049c-4072-bb50-821121b82e82',
        alt: 'Jeep driving along a St. John road',
      },
    },
    directory: {
      title: 'Below are names and numbers of car rentals',
      introParagraph:
        'on St. John. Some rental homes on our hilly island require 4-wheel drive vehicles to navigate the terrain. The most important thing to remember is that we drive on the left here.',
      companies: carRentalCompanies,
      airportParagraph:
        'If you feel comfortable with driving on the left and backing up onto the barge, you can also pick up a rental car at the airport on St. Thomas and drive to the car ferry ("the barge") in Red Hook. Please note, not all rental companies allow their cars to be taken to St. John, but Budget Car Rental does, and it is located right at the airport.',
      budgetPhones: ['1-800-626-4516', '340-776-5774'],
      dependableParagraph:
        'Dependable Car Rental will allow their cars to go to St John also, but do not provide service of vehicles on St John if it were to break down. They are 3 minutes from the airport and offer a shuttle to and from.',
      dependablePhone: '1-800-522-3076',
      detailImage: {
        kind: 'image',
        url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fpages%2Fstjohncarrentals%2Fstjohncarrentals-detail.jpg?alt=media&token=57aa50d1-a786-43b0-882c-b251e7853ba8',
        alt: 'Red jeep parked on a St. John road',
      },
    },
  },
  charterBoats: {
    key: 'charterBoats',
    path: '/boats',
    navLabel: 'Charter Boats',
    group: 'activities',
    source: 'structured',
    contentModel: 'charter-boats',
    hero: {
      title: 'Charter Boats',
      lead: 'Rent a charter boat for an unforgettable St. John adventure.',
      image: {
        kind: 'image',
        url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fpages%2Fcharterboats%2Fcharterboats-hero.jpg?alt=media&token=261eeb7d-15b7-4502-98ae-bc4ac321ea74',
        alt: 'Charter boat cruising blue water near Whistling Cay',
      },
    },
    intro: {
      title: 'Looking for a day sail in the Caribbean?',
      paragraph:
        'Would you like a guided snorkel tour? St. John in the US Virgin Islands boasts some of the most beautiful waters and beaches in the world. Connections East offers a range of charter options, including sailboat and powerboat rentals, to help make your St. John experience truly unforgettable. Whether you want a relaxing sail along the coast or an adventurous snorkeling excursion, our charters provide the perfect way to explore the stunning beauty of the Virgin Islands.',
      image: {
        kind: 'image',
        url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fpages%2Fcharterboats%2Fcharterboats-intro.png?alt=media&token=b0f1c48b-85fb-40da-8c77-0558cc78cc74',
        alt: 'Sailboat charter cruising St. John waters',
      },
    },
    directory: {
      title: 'Charter Boats on St John',
      listings: [],
    },
    safety: {
      title: 'Hurricane Guide & Maritime Safety - What you NEED to know.',
      sections: [
        {
          label: 'Hurricane Guide',
          paragraph:
            'The Virgin Islands Territorial Emergency Management Agency (VITEMA) is an excellent resource for disaster preparedness and response. Hurricane season is June 1st through November 30th. You can find basic information, tracking maps, emergency communication methods and kit suggestions for the various dangerous conditions you can encounter in the Caribbean islands. Visit them at',
          href: 'https://vitema.vi.gov/',
        },
        {
          label: 'Maritime Safety',
          paragraph: 'The USCG has provided the following link for those who are interested in learning more.',
          href: 'https://www.rentalboatsafety.com/',
        },
      ],
    },
  },
  privacyPolicy: createRichContentPage({
    key: 'privacyPolicy',
    path: '/privacy-policy',
    navLabel: 'Privacy Policy',
    title: 'Privacy Policy',
    group: 'legal',
    contentModel: 'legal-content-page',
  }),
  termsOfAgreement: createRichContentPage({
    key: 'termsOfAgreement',
    path: '/terms-of-agreement',
    navLabel: 'Terms Of Agreement',
    title: 'Terms of Agreement',
    group: 'legal',
    contentModel: 'legal-content-page',
  }),
  blog: createRichContentPage({
    key: 'blog',
    path: '/blog',
    navLabel: 'Blog',
    title: 'Blog',
    group: 'marketing',
  }),
  jewelry: createRichContentPage({
    key: 'jewelry',
    path: '/jewelry',
    navLabel: 'Jewelry',
    title: 'Jewelry',
    group: 'marketing',
  }),
  links: createRichContentPage({
    key: 'links',
    path: '/links',
    navLabel: 'Links',
    title: 'Helpful St. John Links',
    group: 'marketing',
  }),
  stJohnBook: createRichContentPage({
    key: 'stJohnBook',
    path: '/st-john-book',
    navLabel: 'St John Books',
    title: 'St. John Books',
    group: 'marketing',
  }),
  art: createRichContentPage({
    key: 'art',
    path: '/art',
    navLabel: 'Art',
    title: 'Art',
    group: 'marketing',
  }),
}

const legacySnapshotPages = []

const dynamicRoutes = [
  { key: 'propertyDetailTemplate', label: 'Property Detail Template', path: '/rental-properties/:slug', title: 'Local rental property detail route', group: 'houses', source: 'catalog-driven' },
  { key: 'charterBoatDetailTemplate', label: 'Charter Boat Detail Template', path: '/charter-boat-rentals/:slug', title: 'Local charter boat detail route', group: 'activities', source: 'catalog-driven' },
  { key: 'adminWorkspace', label: 'Admin Workspace', path: '/admin', title: 'Hidden internal admin route', group: 'internal', source: 'custom' },
]

export const siteShellContent = {
  source: 'structured-seed',
  contact: {
    primaryEmail: 'stjohnlinks@gmail.com',
  },
  header: {
    utility: {
      socialLink: {
        href: 'https://www.facebook.com/houserentalsVI/',
        label: 'Stjohnhousesrentals',
      },
      message: 'Offering Rentals Since 1999',
      bookingCallouts: ['Book Directly', 'NO VRBO or AIRBnB Fees'],
    },
    logo: {
      kind: 'image',
      alt: 'St. John House Rentals',
      url: 'https://firebasestorage.googleapis.com/v0/b/st-john-house-rentals.firebasestorage.app/o/media%2Fsite-shell%2Fsite-shell-logo.png?alt=media&token=f67c91e9-5e6e-4fac-afdf-82dd8fc51979',
    },
    primaryNav: primaryNavItems,
  },
  footer: {
    primaryNav: primaryNavItems,
    legalNav: legalNavItems,
    copyright: 'Copyright 2026 St John Houses Rentals',
    designCredit: 'Design By S9 Consulting',
  },
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value))
}

export function getSiteShellContent() {
  return cloneData(siteShellContent)
}

export function getStructuredPageContent(key) {
  return cloneData(structuredSitePages[key] ?? null)
}

export function listStructuredPages() {
  return Object.values(structuredSitePages).map((page) =>
    cloneData({
      key: page.key,
      label: page.navLabel,
      path: page.path,
      title:
        page.title ||
        page.hero?.title ||
        page.redHook?.titleLines?.[0] ||
        page.story?.title ||
        page.directory?.title ||
        page.intro?.title ||
        page.contact?.title ||
        '',
      group: page.group,
      source: page.source,
      contentModel: page.contentModel,
      routeAliases: page.routeAliases ?? [],
    }),
  )
}

export function listLegacySnapshotPages() {
  return cloneData(legacySnapshotPages)
}

export function listPageInventory() {
  return [...listStructuredPages(), ...cloneData(legacySnapshotPages), ...cloneData(dynamicRoutes)]
}
