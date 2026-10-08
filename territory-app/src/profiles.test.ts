import { describe, expect, test } from 'vitest';
import { avatarsFrom, isProfilePicture, nearbyProfile } from './profiles';
import types from './avatar-types.json';

describe('nearby profile pictures', () => {
  test('every advertised code resolves to an Organized picture', () => {
    types.forEach((avatar, index) => {
      expect(isProfilePicture(avatar)).toBe(true);
      expect(
        nearbyProfile(`Anna~${(index + 1).toString(16).padStart(2, '0')}`)
      ).toEqual({ name: 'Anna', avatar });
    });
  });
  test('keeps legacy names and unknown codes intact', () => {
    for (const name of ['Anna', 'Anna~00', 'Anna~ff', 'Anna~no', ''])
      expect(nearbyProfile(name)).toEqual({ name });
  });
  test('accepts built-in illustrations and old synced photos but never arbitrary URLs', () => {
    expect(
      avatarsFrom([
        { id: 'a', avatar: 'StoryArk' },
        { id: 'b', avatar: 'default' },
        { id: 'c', avatar: 'https://example.com/photo.jpg' },
        { id: 'd', avatar: 'not-a-picture' },
      ])
    ).toEqual({ a: 'StoryArk', b: 'default' });
    expect(isProfilePicture('google')).toBe(false);
  });
});
