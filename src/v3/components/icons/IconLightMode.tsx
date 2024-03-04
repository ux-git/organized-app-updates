import { SvgIcon, SxProps, Theme } from '@mui/material';

type IconProps = {
  color?: string;
  width?: number;
  height?: number;
  sx?: SxProps<Theme>;
};

const IconLightMode = ({ color = '#222222', width = 24, height = 24, sx = {} }: IconProps) => {
  return (
    <SvgIcon id="organized-icon-light-mode" sx={{ width: `${width}px`, height: `${height}px`, ...sx }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <mask
          id="mask0_2473_22045"
          style={{ maskType: 'alpha' }}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="24"
        >
          <rect y="0.500488" width="24" height="24" fill="#D9D9D9" />
        </mask>
        <g mask="url(#mask0_2473_22045)">
          <path
            d="M12 15.5005C12.8333 15.5005 13.5417 15.2088 14.125 14.6255C14.7083 14.0421 15 13.3338 15 12.5005C15 11.6671 14.7083 10.9588 14.125 10.3755C13.5417 9.79213 12.8333 9.50046 12 9.50046C11.1667 9.50046 10.4583 9.79213 9.875 10.3755C9.29167 10.9588 9 11.6671 9 12.5005C9 13.3338 9.29167 14.0421 9.875 14.6255C10.4583 15.2088 11.1667 15.5005 12 15.5005ZM12 17.0004C10.7513 17.0004 9.68913 16.5626 8.81348 15.687C7.93784 14.8113 7.50003 13.7492 7.50003 12.5005C7.50003 11.2518 7.93784 10.1896 8.81348 9.31394C9.68913 8.43831 10.7513 8.00049 12 8.00049C13.2487 8.00049 14.3109 8.43831 15.1865 9.31394C16.0622 10.1896 16.5 11.2518 16.5 12.5005C16.5 13.7492 16.0622 14.8113 15.1865 15.687C14.3109 16.5626 13.2487 17.0004 12 17.0004ZM2 13.2504C1.7875 13.2504 1.60938 13.1785 1.46565 13.0347C1.32188 12.8909 1.25 12.7127 1.25 12.5001C1.25 12.2875 1.32188 12.1094 1.46563 11.9659C1.60936 11.8223 1.78747 11.7505 1.99998 11.7505H4.25C4.46248 11.7505 4.6406 11.8224 4.78435 11.9662C4.92812 12.11 5 12.2882 5 12.5008C5 12.7134 4.92812 12.8915 4.78437 13.0351C4.64062 13.1786 4.46251 13.2504 4.25003 13.2504H2ZM19.75 13.2504C19.5375 13.2504 19.3594 13.1785 19.2156 13.0347C19.0719 12.8909 19 12.7127 19 12.5001C19 12.2875 19.0719 12.1094 19.2156 11.9659C19.3594 11.8223 19.5375 11.7505 19.75 11.7505H22C22.2125 11.7505 22.3906 11.8224 22.5344 11.9662C22.6781 12.11 22.75 12.2882 22.75 12.5008C22.75 12.7134 22.6781 12.8915 22.5344 13.0351C22.3906 13.1786 22.2125 13.2504 22 13.2504H19.75ZM11.9997 5.50046C11.7871 5.50046 11.609 5.42859 11.4654 5.28484C11.3218 5.14109 11.25 4.96297 11.25 4.75049V2.50046C11.25 2.28796 11.3219 2.10984 11.4657 1.96609C11.6095 1.82236 11.7877 1.75049 12.0003 1.75049C12.2129 1.75049 12.391 1.82236 12.5346 1.96609C12.6782 2.10984 12.75 2.28796 12.75 2.50046V4.75049C12.75 4.96297 12.6781 5.14109 12.5343 5.28484C12.3905 5.42859 12.2123 5.50046 11.9997 5.50046ZM11.9997 23.2505C11.7871 23.2505 11.609 23.1786 11.4654 23.0348C11.3218 22.8911 11.25 22.713 11.25 22.5005V20.2504C11.25 20.038 11.3219 19.8598 11.4657 19.7161C11.6095 19.5723 11.7877 19.5005 12.0003 19.5005C12.2129 19.5005 12.391 19.5723 12.5346 19.7161C12.6782 19.8598 12.75 20.038 12.75 20.2504V22.5005C12.75 22.713 12.6781 22.8911 12.5343 23.0348C12.3905 23.1786 12.2123 23.2505 11.9997 23.2505ZM6.0058 7.54081L4.7481 6.31774C4.59938 6.17927 4.52758 6.00524 4.5327 5.79564C4.53783 5.58602 4.61061 5.40365 4.75102 5.24854C4.90419 5.09341 5.08398 5.01584 5.29038 5.01584C5.49679 5.01584 5.67243 5.09341 5.8173 5.24854L7.05 6.49664C7.19487 6.65177 7.2673 6.82741 7.2673 7.02356C7.2673 7.21971 7.19647 7.39535 7.0548 7.55046C6.91315 7.70558 6.74168 7.77897 6.5404 7.77064C6.33912 7.76231 6.16092 7.68568 6.0058 7.54081ZM18.1827 19.7523L16.95 18.5043C16.8051 18.3492 16.7327 18.171 16.7327 17.9697C16.7327 17.7684 16.8051 17.5953 16.95 17.4505C17.0852 17.2953 17.2543 17.222 17.4572 17.2303C17.6601 17.2386 17.8391 17.3152 17.9942 17.4601L19.2519 18.6832C19.4006 18.8216 19.4724 18.9957 19.4673 19.2053C19.4622 19.4149 19.3894 19.5972 19.249 19.7524C19.0958 19.9075 18.916 19.9851 18.7096 19.9851C18.5032 19.9851 18.3276 19.9075 18.1827 19.7523ZM16.95 7.55526C16.7949 7.41361 16.7215 7.24215 16.7298 7.04086C16.7382 6.83958 16.8148 6.66138 16.9596 6.50626L18.1827 5.24856C18.3212 5.09985 18.4952 5.02805 18.7048 5.03316C18.9144 5.0383 19.0968 5.11107 19.2519 5.25149C19.407 5.40466 19.4846 5.58444 19.4846 5.79084C19.4846 5.99726 19.407 6.1729 19.2519 6.31776L18.0038 7.55046C17.8487 7.69533 17.673 7.76776 17.4769 7.76776C17.2808 7.76776 17.1051 7.69693 16.95 7.55526ZM4.7481 19.7545C4.59297 19.5979 4.5154 19.4165 4.5154 19.2101C4.5154 19.0037 4.59297 18.828 4.7481 18.6832L5.99618 17.4505C6.15131 17.3056 6.32951 17.2332 6.53077 17.2332C6.73206 17.2332 6.90513 17.3056 7.05 17.4505C7.19872 17.5857 7.26891 17.7548 7.26058 17.9577C7.25224 18.1605 7.17884 18.3395 7.04037 18.4947L5.8173 19.7524C5.67243 19.9075 5.49679 19.9825 5.29038 19.9774C5.08398 19.9722 4.90322 19.8979 4.7481 19.7545Z"
            fill={color}
          />
        </g>
      </svg>
    </SvgIcon>
  );
};

export default IconLightMode;