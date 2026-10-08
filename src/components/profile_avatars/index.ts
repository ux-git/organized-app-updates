import { ComponentType, SVGProps } from 'react';
import {
  AvatarIconName,
  AvatarImageName,
  AvatarType,
} from '@definition/settings';

import GradientOrange from './profile-img-gradient-orange.svg?url&no-inline';
import GradientBrown from './profile-img-gradient-brown.svg?url&no-inline';
import GradientLime from './profile-img-gradient-lime.svg?url&no-inline';
import GradientGreen from './profile-img-gradient-green.svg?url&no-inline';
import GradientBlue from './profile-img-gradient-blue.svg?url&no-inline';
import GradientPurple from './profile-img-gradient-purple.svg?url&no-inline';
import GradientPink from './profile-img-gradient-pink.svg?url&no-inline';

import Abstract1 from './profile-img-abstract-1.svg?url&no-inline';
import Abstract2 from './profile-img-abstract-2.svg?url&no-inline';
import Abstract3 from './profile-img-abstract-3.svg?url&no-inline';
import Abstract4 from './profile-img-abstract-4.svg?url&no-inline';
import Abstract5 from './profile-img-abstract-5.svg?url&no-inline';
import Abstract6 from './profile-img-abstract-6.svg?url&no-inline';
import Abstract7 from './profile-img-abstract-7.svg?url&no-inline';
import Abstract8 from './profile-img-abstract-8.svg?url&no-inline';
import Abstract9 from './profile-img-abstract-9.svg?url&no-inline';
import Abstract10 from './profile-img-abstract-10.svg?url&no-inline';

import StoryArk from './profile-img-story-ark.svg?url&no-inline';
import StoryBible from './profile-img-story-bible.svg?url&no-inline';
import StoryField from './profile-img-story-field.svg?url&no-inline';
import StoryFigs from './profile-img-story-figs.svg?url&no-inline';
import StoryGrapes from './profile-img-story-grapes.svg?url&no-inline';
import StoryHelmet from './profile-img-story-helmet.svg?url&no-inline';
import StoryLamp from './profile-img-story-lamp.svg?url&no-inline';
import StoryLeaves from './profile-img-story-leaves.svg?url&no-inline';
import StoryLionScripture from './profile-img-story-lion-scripture.svg?url&no-inline';
import StoryMountain from './profile-img-story-mountain.svg?url&no-inline';
import StoryPearl from './profile-img-story-pearl.svg?url&no-inline';
import StoryRedSea from './profile-img-story-red-sea.svg?url&no-inline';
import StoryRod from './profile-img-story-rod.svg?url&no-inline';
import StorySeeds from './profile-img-story-seeds.svg?url&no-inline';
import StorySheep from './profile-img-story-sheep.svg?url&no-inline';
import StoryShield from './profile-img-story-shield.svg?url&no-inline';
import StoryValley from './profile-img-story-valley.svg?url&no-inline';
import StoryWatchtower from './profile-img-story-watchtower.svg?url&no-inline';

import Male1 from './profile-male-1.svg?url&no-inline';
import Male2 from './profile-male-2.svg?url&no-inline';
import Male3 from './profile-male-3.svg?url&no-inline';
import Male4 from './profile-male-4.svg?url&no-inline';

import Female1 from './profile-female-1.svg?url&no-inline';
import Female2 from './profile-female-2.svg?url&no-inline';
import Female3 from './profile-female-3.svg?url&no-inline';
import Female4 from './profile-female-4.svg?url&no-inline';
import Female5 from './profile-female-5.svg?url&no-inline';

import MaleIcon1Component from './MaleIcon1Component';
import MaleIcon2Component from './MaleIcon2Component';
import MaleIcon3Component from './MaleIcon3Component';
import FemaleIcon1Component from './FemaleIcon1Component';
import FemaleIcon2Component from './FemaleIcon2Component';
import FemaleIcon3Component from './FemaleIcon3Component';
import GenericProfileComponent from './GenericProfileComponent';

export type AvatarIconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Illustrations rendered as `<img>`: each SVG keeps its own gradient ids that
 * way, which would otherwise collide when several are inlined on one page.
 */
export const AVATAR_IMAGES: Record<AvatarImageName, string> = {
  GradientOrange,
  GradientBrown,
  GradientLime,
  GradientGreen,
  GradientBlue,
  GradientPurple,
  GradientPink,
  Abstract1,
  Abstract2,
  Abstract3,
  Abstract4,
  Abstract5,
  Abstract6,
  Abstract7,
  Abstract8,
  Abstract9,
  Abstract10,
  StoryArk,
  StoryBible,
  StoryField,
  StoryFigs,
  StoryGrapes,
  StoryHelmet,
  StoryLamp,
  StoryLeaves,
  StoryLionScripture,
  StoryMountain,
  StoryPearl,
  StoryRedSea,
  StoryRod,
  StorySeeds,
  StorySheep,
  StoryShield,
  StoryValley,
  StoryWatchtower,
  Male1,
  Male2,
  Male3,
  Male4,
  Female1,
  Female2,
  Female3,
  Female4,
  Female5,
};

/**
 * Icons rendered inline so that they can follow the accent color of the theme.
 */
export const AVATAR_ICONS: Record<AvatarIconName, AvatarIconComponent> = {
  MaleIcon1: MaleIcon1Component,
  MaleIcon2: MaleIcon2Component,
  MaleIcon3: MaleIcon3Component,
  FemaleIcon1: FemaleIcon1Component,
  FemaleIcon2: FemaleIcon2Component,
  FemaleIcon3: FemaleIcon3Component,
};

export const isAvatarImage = (type: AvatarType): type is AvatarImageName =>
  type in AVATAR_IMAGES;

export const isAvatarIcon = (type: AvatarType): type is AvatarIconName =>
  type in AVATAR_ICONS;

export { GenericProfileComponent };
