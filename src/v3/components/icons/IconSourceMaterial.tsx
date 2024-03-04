import { SvgIcon, SxProps, Theme } from '@mui/material';

type IconProps = {
  color?: string;
  width?: number;
  height?: number;
  sx?: SxProps<Theme>;
};

const IconSourceMaterial = ({ color = '#222222', width = 24, height = 24, sx = {} }: IconProps) => {
  return (
    <SvgIcon id="organized-icon-source-material" sx={{ width: `${width}px`, height: `${height}px`, ...sx }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <mask
          id="mask0_2513_2634"
          style={{ maskType: 'alpha' }}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="24"
        >
          <rect y="0.500488" width="24" height="24" fill="#D9D9D9" />
        </mask>
        <g mask="url(#mask0_2513_2634)">
          <path
            d="M5.99997 22.0004C5.30127 22.0004 4.70993 21.7585 4.22595 21.2745C3.74198 20.7905 3.5 20.1992 3.5 19.5005V16.6159H6.5V3.00049H20.5V19.5005C20.5 20.1992 20.258 20.7905 19.774 21.2745C19.29 21.7585 18.6987 22.0004 18 22.0004H5.99997ZM18 20.5005C18.2833 20.5005 18.5208 20.4046 18.7125 20.213C18.9041 20.0213 19 19.7838 19 19.5005V4.50046H7.99998V16.6159H17V19.5005C17 19.7838 17.0958 20.0213 17.2875 20.213C17.4791 20.4046 17.7166 20.5005 18 20.5005ZM9.1923 9.19274V7.69279H17.8077V9.19274H9.1923ZM9.1923 12.0774V10.5774H17.8077V12.0774H9.1923ZM5.99997 20.5005H15.5V18.1158H4.99997V19.5005C4.99997 19.7838 5.09581 20.0213 5.28747 20.213C5.47914 20.4046 5.71664 20.5005 5.99997 20.5005ZM5.99997 20.5005H4.99997H15.5H5.99997Z"
            fill={color}
          />
        </g>
      </svg>
    </SvgIcon>
  );
};

export default IconSourceMaterial;