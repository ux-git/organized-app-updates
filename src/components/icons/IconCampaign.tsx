import { SvgIcon, SxProps, Theme } from '@mui/material';

type IconProps = {
  color?: string;
  width?: number;
  height?: number;
  sx?: SxProps<Theme>;
  className?: string;
};

const IconCampaign = ({
  color = '#222222',
  width = 24,
  height = 24,
  sx = {},
  className,
}: IconProps) => {
  return (
    <SvgIcon
      className={`organized-icon-campaign ${className}`}
      sx={{ width: `${width}px`, height: `${height}px`, ...sx }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <mask
          id="mask0_6599_288054"
          style={{ maskType: 'alpha' }}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="25"
        >
          <rect y="0.000488281" width="24" height="24" fill="#D9D9D9" />
        </mask>
        <g mask="url(#mask0_6599_288054)">
          <path
            d="M17.9618 12.7506V11.2507H21.5771V12.7506H17.9618ZM19.1041 19.4814L16.2118 17.3122L17.1233 16.116L20.0156 18.2852L19.1041 19.4814ZM17.0848 7.8468L16.1733 6.65067L19.0656 4.48145L19.9771 5.67757L17.0848 7.8468ZM5.25026 18.4814V14.5775H4.23101C3.73231 14.5775 3.30636 14.4009 2.95314 14.0477C2.59994 13.6945 2.42334 13.2686 2.42334 12.7699V11.2314C2.42334 10.7327 2.59994 10.3068 2.95314 9.95355C3.30636 9.60035 3.73231 9.42375 4.23101 9.42375H8.09639L12.5771 6.7507V17.2506L8.09639 14.5775H6.75021V18.4814H5.25026ZM11.0772 14.5853V9.41602L8.51176 10.9237H4.23101C4.1541 10.9237 4.08358 10.9558 4.01946 11.0199C3.95536 11.084 3.92331 11.1545 3.92331 11.2314V12.7699C3.92331 12.8468 3.95536 12.9173 4.01946 12.9814C4.08358 13.0455 4.1541 13.0776 4.23101 13.0776H8.51176L11.0772 14.5853ZM13.9618 15.1199V8.88142C14.3541 9.23655 14.6701 9.68399 14.9098 10.2237C15.1496 10.7635 15.2695 11.3558 15.2695 12.0006C15.2695 12.6455 15.1496 13.2378 14.9098 13.7776C14.6701 14.3173 14.3541 14.7647 13.9618 15.1199Z"
            fill={color}
          />
        </g>
      </svg>
    </SvgIcon>
  );
};

export default IconCampaign;
