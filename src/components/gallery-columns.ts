import { useWindowDimensions } from 'react-native';

export function galleryColumns(width: number): number {
  return width >= 1000 ? 5 : width >= 700 ? 4 : width >= 480 ? 3 : 2;
}

export function useGalleryColumns(): number {
  return galleryColumns(useWindowDimensions().width);
}
