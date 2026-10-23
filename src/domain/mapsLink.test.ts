import {
  acceptedRedirect,
  findPlaceDuplicate,
  hasPlaceFacts,
  isGoogleMapsLink,
  isShortMapsLink,
  parseMapsLink,
} from './mapsLink';

/** The two redirects Google Maps' short links gave on 2026-10-23 (plan §2), query strings shortened. */
const ARKTIKUM =
  'https://www.google.com/maps/place/Arktikum,+Pohjoisranta+4,+96200+Rovaniemi,+Finland/data=!4m2!3m1!1s0x442b4b8bb73507b3:0x56f56aa8cab0c49!18m1!1e1?utm_source=mstt_1&entry=gps&coh=192189';
const WITH_PIN =
  'https://www.google.com/maps/place/%D0%9A%D0%BB%D0%B0%D0%B4%D0%B1%D0%B8%D1%89%D0%B5+%D1%84%D0%B8%D0%BD%D0%BA%D0%B0,+96200+Rovaniemi,+Finland/data=!4m6!3m5!1s0x442b4b904fdfd74d:0x640c8c37e13caacb!7e2!8m2!3d66.50394779999999!4d25.7293906!18m1!1e1?utm_source=mstt_1';

describe('recognising Google Maps links', () => {
  it('knows the short links the share sheet sends', () => {
    expect(isShortMapsLink('https://maps.app.goo.gl/7428vcha2w3v6QgP7')).toBe(true);
    expect(isShortMapsLink('https://goo.gl/maps/AbC123')).toBe(true);
    expect(isGoogleMapsLink('https://maps.app.goo.gl/7428vcha2w3v6QgP7')).toBe(true);
  });

  it('refuses look-alikes and anything that is not plain https to Google', () => {
    for (const url of [
      'http://maps.app.goo.gl/7428vcha2w3v6QgP7',
      'https://maps.app.goo.gl.evil.example/abc',
      'https://evil.example/maps.app.goo.gl/abc',
      'https://user:pw@maps.app.goo.gl/abc',
      'https://maps.app.goo.gl:8443/abc',
      'https://goo.gl/abc',
      'https://maps.app.goo.gl/a/b/c',
    ]) {
      expect([url, isShortMapsLink(url)]).toEqual([url, false]);
    }
    for (const url of [
      'https://www.google.com.evil.example/maps/place/X',
      'https://evil.example/maps/place/X',
      'https://www.google.com/search?q=maps',
      'javascript:alert(1)',
      'https://www.google.com@evil.example/maps/place/X',
    ]) {
      expect([url, isGoogleMapsLink(url)]).toEqual([url, false]);
    }
  });
});

describe('parseMapsLink', () => {
  it('reads the name and address a place URL carries, and no coordinates when it has none', () => {
    expect(parseMapsLink(ARKTIKUM)).toEqual({
      name: 'Arktikum',
      address: 'Pohjoisranta 4, 96200 Rovaniemi, Finland',
      latitude: null,
      longitude: null,
    });
  });

  it("reads the place's own pin, !3d and !4d, in Cyrillic too", () => {
    expect(parseMapsLink(WITH_PIN)).toEqual({
      name: 'Кладбище финка',
      address: '96200 Rovaniemi, Finland',
      latitude: 66.5039478,
      longitude: 25.7293906,
    });
  });

  it('never takes the viewport (@lat,lng) for the place', () => {
    const url = 'https://www.google.com/maps/place/Arktikum/@66.5,25.7,17z/data=!4m2!3m1!1s0x1:0x2';
    expect(parseMapsLink(url)).toEqual({ name: 'Arktikum', address: null, latitude: null, longitude: null });
    expect(parseMapsLink('https://www.google.com/maps/@66.5039,25.7294,15z')).toEqual({
      name: null,
      address: null,
      latitude: null,
      longitude: null,
    });
    // The pin wins over the viewport when both are there.
    expect(parseMapsLink('https://www.google.fi/maps/place/X/@60,20,17z/data=!3m1!4b1!4m6!3m5!1s0x:0x!8m2!3d66.5!4d25.7')).toMatchObject({
      latitude: 66.5,
      longitude: 25.7,
    });
  });

  it("reads Google's documented query links and the older q=, ll= and daddr=", () => {
    expect(parseMapsLink('https://www.google.com/maps/search/?api=1&query=66.5039%2C25.7294')).toMatchObject({
      latitude: 66.5039,
      longitude: 25.7294,
    });
    expect(parseMapsLink('https://www.google.com/maps/search/?api=1&query=Arktikum%2C+Rovaniemi')).toEqual({
      name: 'Arktikum',
      address: 'Rovaniemi',
      latitude: null,
      longitude: null,
    });
    expect(parseMapsLink('https://maps.google.com/?q=66.5,25.7')).toMatchObject({ latitude: 66.5, longitude: 25.7 });
    expect(parseMapsLink('https://maps.google.co.uk/maps?ll=-33.86,151.21')).toMatchObject({ latitude: -33.86, longitude: 151.21 });
    expect(parseMapsLink('https://www.google.com/maps?daddr=Duomo+di+Milano')).toMatchObject({ name: 'Duomo di Milano' });
    expect(parseMapsLink('https://www.google.com/maps/search/66.5039,+25.7294')).toMatchObject({ latitude: 66.5039 });
  });

  it('reads a dropped pin named in degrees, minutes and seconds', () => {
    const pin = parseMapsLink(`https://www.google.com/maps/place/66%C2%B030'14.2%22N+25%C2%B043'45.8%22E/`);
    expect(pin).toEqual({ name: null, address: null, latitude: 66.503944, longitude: 25.729389 });
    expect(parseMapsLink(`https://www.google.com/maps/place/33%C2%B051'36.0%22S+151%C2%B012'36.0%22E`)).toMatchObject({
      latitude: -33.86,
      longitude: 151.21,
    });
  });

  it('reads geo: links, where 0,0 means no position', () => {
    expect(parseMapsLink('geo:66.50395,25.7294')).toEqual({ name: null, address: null, latitude: 66.50395, longitude: 25.7294 });
    expect(parseMapsLink('geo:0,0?q=Arktikum')).toEqual({ name: 'Arktikum', address: null, latitude: null, longitude: null });
    expect(parseMapsLink('geo:0,0?q=66.5,25.7')).toMatchObject({ latitude: 66.5, longitude: 25.7, name: null });
  });

  it('refuses coordinates out of range rather than keeping them', () => {
    expect(parseMapsLink('https://maps.google.com/?q=95,25')).toMatchObject({ latitude: null });
    expect(parseMapsLink('https://www.google.com/maps/place/X/data=!3d123!4d25')).toMatchObject({ latitude: null });
  });

  it('returns null for a short link (it needs the lookup) and for anything not Google Maps', () => {
    expect(parseMapsLink('https://maps.app.goo.gl/7428vcha2w3v6QgP7')).toBeNull();
    expect(parseMapsLink('https://www.booking.com/hotel/fi/arctic.html')).toBeNull();
    expect(parseMapsLink('not a url')).toBeNull();
  });

  it('keeps names and addresses to a sane length, with no stray spaces', () => {
    const long = `https://www.google.com/maps/place/${'A'.repeat(500)}`;
    expect(parseMapsLink(long)!.name).toHaveLength(240);
    expect(parseMapsLink('https://www.google.com/maps/place/%20%20Cafe%20%20Kauppayhtio%20%20')!.name).toBe('Cafe Kauppayhtio');
  });

  it('survives malformed escapes', () => {
    expect(parseMapsLink('https://www.google.com/maps/place/%E0%A4%A/')).toEqual({
      name: null,
      address: null,
      latitude: null,
      longitude: null,
    });
  });
});

describe('acceptedRedirect — where a short-link lookup may end', () => {
  it('reads a Google Maps page it was sent to', () => {
    expect(acceptedRedirect(ARKTIKUM)).toMatchObject({ name: 'Arktikum' });
    expect(acceptedRedirect(WITH_PIN)).toMatchObject({ latitude: 66.5039478 });
  });

  it("unwraps Google's cookie notice", () => {
    const consent = `https://consent.google.com/ml?continue=${encodeURIComponent(WITH_PIN)}&gl=FI&hl=en`;
    expect(acceptedRedirect(consent)).toMatchObject({ name: 'Кладбище финка', latitude: 66.5039478 });
  });

  it('trusts nothing else', () => {
    for (const url of [
      'https://evil.example/maps/place/Arktikum',
      ARKTIKUM.replace('https:', 'http:'),
      `https://consent.google.com/ml?continue=${encodeURIComponent('https://evil.example/maps/place/X')}`,
      'https://maps.app.goo.gl/7428vcha2w3v6QgP7',
      'https://www.google.com/sorry/index?continue=x',
      '',
    ]) {
      expect([url, acceptedRedirect(url)]).toEqual([url, null]);
    }
  });
});

describe('hasPlaceFacts', () => {
  it('is false for a Maps link that names no place', () => {
    expect(hasPlaceFacts(parseMapsLink('https://www.google.com/maps/@66.5,25.7,15z'))).toBe(false);
    expect(hasPlaceFacts(parseMapsLink(ARKTIKUM))).toBe(true);
    expect(hasPlaceFacts(null)).toBe(false);
  });
});

describe('findPlaceDuplicate (P7-4)', () => {
  const items = [
    { id: 'a', title: 'Arktikum', status: 'idea' as const, latitude: null, longitude: null },
    { id: 'h', title: 'Arctic Snow Hotel', status: 'confirmed' as const, latitude: 66.6, longitude: 26.0 },
  ];

  it('warns about the same title, however written', () => {
    expect(findPlaceDuplicate({ title: 'ARKTIKUM ', latitude: null, longitude: null }, items)).toMatchObject({
      id: 'a',
      reason: 'title',
    });
  });

  it('warns about a place within 100 m, whatever its name', () => {
    expect(findPlaceDuplicate({ title: 'Snow hotel', latitude: 66.6005, longitude: 26.0 }, items)).toMatchObject({
      id: 'h',
      reason: 'place',
    });
    expect(findPlaceDuplicate({ title: 'Snow hotel', latitude: 66.61, longitude: 26.0 }, items)).toBeNull();
  });
});
