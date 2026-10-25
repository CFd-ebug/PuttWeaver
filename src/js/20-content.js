// ================= data =================
// Map Quest places, modeled on maptap: one round from each tier, easiest first. Tiers are set for a US audience. Fields: name, region ('' when the country alone
// is a small enough search), country, lat, lon. Plain facts (names and coordinates), written for this project.
const PLACE_TIERS = [
  {label:'Easy', color:'#9fb3ff', list:[
    ['Tokyo','','Japan',35.68,139.69], ['Delhi','','India',28.61,77.21], ['Shanghai','','China',31.23,121.47],
    ['São Paulo','','Brazil',-23.55,-46.63], ['Mexico City','','Mexico',19.43,-99.13], ['Cairo','','Egypt',30.04,31.24],
    ['Mumbai','Maharashtra','India',19.08,72.88], ['Beijing','','China',39.90,116.40], ['New York','New York','USA',40.71,-74.01],
    ['Buenos Aires','','Argentina',-34.60,-58.38], ['Istanbul','','Türkiye',41.01,28.98], ['Moscow','','Russia',55.76,37.62],
    ['London','','United Kingdom',51.51,-0.13], ['Los Angeles','California','USA',34.05,-118.24], ['Chicago','Illinois','USA',41.88,-87.63],
    ['Sydney','New South Wales','Australia',-33.87,151.21], ['Toronto','Ontario','Canada',43.65,-79.38], ['Rome','','Italy',41.90,12.50],
    ['Madrid','','Spain',40.42,-3.70], ['Berlin','','Germany',52.52,13.40]
  ]},
  {label:'Medium', color:'#c9a8ff', list:[
    ['Nairobi','','Kenya',-1.29,36.82], ['Johannesburg','','South Africa',-26.20,28.05], ['Singapore','','Singapore',1.35,103.82],
    ['Riyadh','','Saudi Arabia',24.71,46.68], ['Bogotá','','Colombia',4.71,-74.07], ['Santiago','','Chile',-33.45,-70.67],
    ['Hanoi','','Vietnam',21.03,105.85], ['Casablanca','','Morocco',33.57,-7.59], ['Vancouver','British Columbia','Canada',49.28,-123.12],
    ['Havana','','Cuba',23.11,-82.37], ['Athens','','Greece',37.98,23.73], ['Kabul','','Afghanistan',34.56,69.21],
    ['Melbourne','Victoria','Australia',-37.81,144.96], ['Lagos','','Nigeria',6.52,3.38], ['Manila','','Philippines',14.60,120.98],
    ['Jakarta','','Indonesia',-6.21,106.85], ['Salt Lake City','Utah','USA',40.76,-111.89], ['Hilo','Hawaii','USA',19.72,-155.08],
    ['Machu Picchu','','Peru',-13.16,-72.55], ['Mount Everest','','Nepal and China',27.99,86.93]
  ]},
  {label:'Hard', color:'#ff9ab8', list:[
    ['Lyon','','France',45.76,4.84], ['Porto','','Portugal',41.15,-8.61], ['Kraków','','Poland',50.06,19.94],
    ['Marrakesh','','Morocco',31.63,-7.99], ['Mombasa','','Kenya',-4.04,39.67], ['Ulaanbaatar','','Mongolia',47.89,106.91],
    ['Naha','Okinawa','Japan',26.21,127.68], ['Vladivostok','Primorsky Krai','Russia',43.12,131.89], ['Christchurch','','New Zealand',-43.53,172.64],
    ['Dhaka','','Bangladesh',23.81,90.41], ['Karachi','','Pakistan',24.86,67.01], ['Kinshasa','','DR Congo',-4.44,15.27],
    ['Addis Ababa','','Ethiopia',9.03,38.74], ['Nome','Alaska','USA',64.50,-165.41], ['Victoria Falls','','Zambia and Zimbabwe',-17.92,25.86],
    ['Mount Kilimanjaro','','Tanzania',-3.07,37.35], ['Angkor Wat','','Cambodia',13.41,103.87], ['Petra','','Jordan',30.33,35.44],
    ['Uluru','Northern Territory','Australia',-25.34,131.04], ['Galápagos Islands','','Ecuador',-0.74,-90.32]
  ]},
  {label:'Expert', color:'#ff6b6b', list:[
    ['Ushuaia','Tierra del Fuego','Argentina',-54.80,-68.30], ['Nuuk','','Greenland',64.18,-51.72], ['Iqaluit','Nunavut','Canada',63.75,-68.52],
    ['Whitehorse','Yukon','Canada',60.72,-135.06], ['Butte','Montana','USA',46.00,-112.53], ['Tromsø','','Norway',69.65,18.96],
    ['Bergen','','Norway',60.39,5.32], ['Tórshavn','','Faroe Islands',62.01,-6.77], ['Norilsk','Krasnoyarsk Krai','Russia',69.35,88.20],
    ['Timbuktu','','Mali',16.77,-3.01], ['Lamu','','Kenya',-2.27,40.90], ['Leh','Ladakh','India',34.16,77.58],
    ['Thimphu','','Bhutan',27.47,89.64], ['Luang Prabang','','Laos',19.89,102.13], ['Asmara','','Eritrea',15.32,38.93],
    ['Antananarivo','','Madagascar',-18.88,47.51], ['Samarkand','','Uzbekistan',39.65,66.96], ['Tbilisi','','Georgia',41.72,44.79],
    ['Mount Katahdin','Maine','USA',45.90,-68.92], ['Easter Island','','Chile',-27.11,-109.35]
  ]}
].map(t => ({label:t.label, color:t.color, list:t.list.map(([name,region,country,lat,lon]) => ({name, where: region ? region+', '+country : country, country, lat, lon}))}));

// Map Quest result quips, shown as the result title. One is picked at random from the group that matches the miss distance.
// A few places have their own pair, which replaces the general line. Written for this project.
const MAP_ASK = ['Was that a putting problem or a geography problem?', 'Blame the putter, or blame the atlas?',
  'Great aim at the wrong place, or bad aim at the right one?', 'Hard to say if that’s your stroke or your schoolwork.', 'We’ll say the green was crooked.'];
const MAP_QUIPS = {
  hit: ['Pinpoint. Do you live there?', 'The locals would like a word with your travel agent.', 'Somewhere, a geography teacher just felt proud.',
    'Right on the money. Frame this one.', 'That’s not a guess, that’s a GPS.'],
  near: ['Close enough to see it on a clear day.', 'Right neighborhood, wrong doorstep.', 'One more nudge and that was perfect.', 'You could take a bus from there.', ...MAP_ASK],
  region: ['Right region, wrong postcard.', 'Warm. Not hot, but warm.', 'You’d get there by dinner. Maybe breakfast.', 'The general vibe was correct.', ...MAP_ASK],
  far: ['Bold choice. Wrong, but bold.', 'That’s a connecting flight away.', 'The ball had other plans.', 'You found a place. Just not this one.', ...MAP_ASK],
  world: ['Somewhere, a globe is spinning in disbelief.', 'Pack a bigger suitcase.', 'At least you’re on the same planet.', 'Have you considered a map?'],
  gone: ['The ball left to explore on its own.', 'That one’s still traveling.', 'Off the edge of the known world.']
};
const MAP_PLACE_QUIPS = {
  'Mount Everest': {hit:'Summit reached. No oxygen needed.', miss:'You missed the tallest thing on Earth. Impressive.'},
  'Machu Picchu': {hit:'You found the lost city.', miss:'The Inca hid it well. So did you.'},
  'Timbuktu': {hit:'You found the end of the earth. It’s in Mali.', miss:'Turns out it’s a real place.'},
  'Hilo': {hit:'Aloha!', miss:'Aloha also means goodbye.'}
};

const EVENTS = [
  ['The Wright brothers make the first powered flight',1903], ['The Titanic sinks',1912], ['The Panama Canal opens',1914],
  ['US women win the right to vote (19th Amendment)',1920], ['Penicillin is discovered',1928], ['Pluto is discovered',1930],
  ['The Golden Gate Bridge opens',1937], ['World War II ends',1945], ['Mount Everest is first summited',1953],
  ['Disneyland opens',1955], ['Telstar relays the first live transatlantic TV',1962], ['The first Super Bowl is played',1967],
  ['Apollo 11 lands on the Moon',1969], ['The Rubik’s Cube is invented',1974], ['The first Star Wars film premieres',1977],
  ['The Sony Walkman goes on sale',1979], ['The Chernobyl disaster',1986], ['The Berlin Wall falls',1989],
  ['The Hubble Space Telescope launches',1990], ['The first text message is sent',1992], ['The Channel Tunnel opens',1994],
  ['Toy Story opens in theaters',1995], ['The first Harry Potter book is published',1997], ['Google is founded',1998],
  ['Euro coins and banknotes enter circulation',2002], ['Facebook launches',2004], ['YouTube launches',2005],
  ['The first iPhone goes on sale',2007], ['Bitcoin’s first block is mined',2009]
].map(([text,year]) => ({text,year}));

const DOTS = Array.from({length:140}, () => [Math.random(), Math.random(), 0.01+Math.random()*0.018]);

