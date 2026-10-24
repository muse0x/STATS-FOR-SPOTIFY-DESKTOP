export const MockUser = {
  id: 'spotify_user_demo',
  display_name: 'Alex Rivera',
  images: [{ url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80' }],
  followers: { total: 142 }
};

export const MockTracks = {
  short_term: [
    {
      id: '1',
      name: 'Espresso',
      artists: [{ name: 'Sabrina Carpenter' }],
      album: {
        name: "Short n' Sweet",
        images: [{ url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=120&auto=format&fit=crop&q=80' }]
      },
      duration_ms: 175459,
      external_urls: { spotify: 'https://open.spotify.com' },
      uri: 'spotify:track:1'
    },
    {
      id: '2',
      name: 'Birds of a Feather',
      artists: [{ name: 'Billie Eilish' }],
      album: {
        name: 'HIT ME HARD AND SOFT',
        images: [{ url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=120&auto=format&fit=crop&q=80' }]
      },
      duration_ms: 196373,
      external_urls: { spotify: 'https://open.spotify.com' },
      uri: 'spotify:track:2'
    },
    {
      id: '3',
      name: 'Good Luck, Babe!',
      artists: [{ name: 'Chappell Roan' }],
      album: {
        name: 'Good Luck, Babe!',
        images: [{ url: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=120&auto=format&fit=crop&q=80' }]
      },
      duration_ms: 218423,
      external_urls: { spotify: 'https://open.spotify.com' },
      uri: 'spotify:track:3'
    },
    {
      id: '4',
      name: 'Not Like Us',
      artists: [{ name: 'Kendrick Lamar' }],
      album: {
        name: 'Not Like Us',
        images: [{ url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120&auto=format&fit=crop&q=80' }]
      },
      duration_ms: 274192,
      external_urls: { spotify: 'https://open.spotify.com' },
      uri: 'spotify:track:4'
    },
    {
      id: '5',
      name: 'A Bar Song (Tipsy)',
      artists: [{ name: 'Shaboozey' }],
      album: {
        name: "Where I've Been, Isn't Where I'm Going",
        images: [{ url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=120&auto=format&fit=crop&q=80' }]
      },
      duration_ms: 171291,
      external_urls: { spotify: 'https://open.spotify.com' },
      uri: 'spotify:track:5'
    }
  ],
  medium_term: [
    {
      id: '6',
      name: 'Cruel Summer',
      artists: [{ name: 'Taylor Swift' }],
      album: {
        name: 'Lover',
        images: [{ url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=120&auto=format&fit=crop&q=80' }]
      },
      duration_ms: 178277,
      external_urls: { spotify: 'https://open.spotify.com' },
      uri: 'spotify:track:6'
    },
    {
      id: '7',
      name: 'Greedy',
      artists: [{ name: 'Tate McRae' }],
      album: {
        name: 'THINK LATER',
        images: [{ url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=120&auto=format&fit=crop&q=80' }]
      },
      duration_ms: 131872,
      external_urls: { spotify: 'https://open.spotify.com' },
      uri: 'spotify:track:7'
    }
  ],
  long_term: [
    {
      id: '8',
      name: 'Starboy',
      artists: [{ name: 'The Weeknd' }],
      album: {
        name: 'Starboy',
        images: [{ url: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=120&auto=format&fit=crop&q=80' }]
      },
      duration_ms: 230453,
      external_urls: { spotify: 'https://open.spotify.com' },
      uri: 'spotify:track:8'
    }
  ]
};

export const MockArtists = {
  short_term: [
    {
      id: 'a1',
      name: 'Sabrina Carpenter',
      genres: ['pop', 'dance pop', 'post-teen pop'],
      images: [{ url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80' }],
      popularity: 96,
      followers: { total: 22400000 }
    },
    {
      id: 'a2',
      name: 'Billie Eilish',
      genres: ['art pop', 'electropop', 'pop'],
      images: [{ url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80' }],
      popularity: 94,
      followers: { total: 98000000 }
    },
    {
      id: 'a3',
      name: 'Kendrick Lamar',
      genres: ['conscious hip hop', 'hip hop', 'rap', 'west coast rap'],
      images: [{ url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80' }],
      popularity: 92,
      followers: { total: 32000000 }
    },
    {
      id: 'a4',
      name: 'The Weeknd',
      genres: ['canadian contemporary r&b', 'canadian pop', 'pop'],
      images: [{ url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80' }],
      popularity: 98,
      followers: { total: 89000000 }
    }
  ],
  medium_term: [],
  long_term: []
};

export const MockRecentlyPlayed = [
  {
    track: {
      id: 'r1',
      name: 'Espresso',
      artists: [{ name: 'Sabrina Carpenter' }],
      album: {
        name: "Short n' Sweet",
        images: [{ url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=120&auto=format&fit=crop&q=80' }]
      },
      duration_ms: 175459,
      external_urls: { spotify: 'https://open.spotify.com' }
    },
    played_at: new Date(Date.now() - 1000 * 60 * 4).toISOString()
  },
  {
    track: {
      id: 'r2',
      name: 'Birds of a Feather',
      artists: [{ name: 'Billie Eilish' }],
      album: {
        name: 'HIT ME HARD AND SOFT',
        images: [{ url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=120&auto=format&fit=crop&q=80' }]
      },
      duration_ms: 196373,
      external_urls: { spotify: 'https://open.spotify.com' }
    },
    played_at: new Date(Date.now() - 1000 * 60 * 22).toISOString()
  },
  {
    track: {
      id: 'r3',
      name: 'Not Like Us',
      artists: [{ name: 'Kendrick Lamar' }],
      album: {
        name: 'Not Like Us',
        images: [{ url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120&auto=format&fit=crop&q=80' }]
      },
      duration_ms: 274192,
      external_urls: { spotify: 'https://open.spotify.com' }
    },
    played_at: new Date(Date.now() - 1000 * 60 * 55).toISOString()
  }
];
