// ================= data =================
const PLACES = [
  ['Tokyo','Japan',35.68,139.69], ['Cairo','Egypt',30.04,31.24], ['Sydney','Australia',-33.87,151.21],
  ['Rio de Janeiro','Brazil',-22.91,-43.17], ['London','United Kingdom',51.51,-0.13], ['New York','United States',40.71,-74.01],
  ['Mumbai','India',19.08,72.88], ['Nairobi','Kenya',-1.29,36.82], ['Moscow','Russia',55.76,37.62],
  ['Mexico City','Mexico',19.43,-99.13], ['Buenos Aires','Argentina',-34.60,-58.38], ['Beijing','China',39.90,116.40],
  ['Cape Town','South Africa',-33.92,18.42], ['Reykjavík','Iceland',64.15,-21.94], ['Honolulu','United States',21.31,-157.86],
  ['Lima','Peru',-12.05,-77.04], ['Anchorage','United States',61.22,-149.90], ['Singapore','Singapore',1.35,103.82],
  ['Istanbul','Türkiye',41.01,28.98], ['Lagos','Nigeria',6.52,3.38], ['Vancouver','Canada',49.28,-123.12],
  ['Bangkok','Thailand',13.76,100.50], ['Auckland','New Zealand',-36.85,174.76], ['Madrid','Spain',40.42,-3.70],
  ['Dubai','United Arab Emirates',25.20,55.27], ['Seoul','South Korea',37.57,126.98], ['Havana','Cuba',23.11,-82.37],
  ['Perth','Australia',-31.95,115.86], ['Mount Everest','Nepal and China',27.99,86.93], ['Machu Picchu','Peru',-13.16,-72.55],
  ['Easter Island','Chile',-27.11,-109.35]
].map(([name,country,lat,lon]) => ({name,country,lat,lon}));

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

