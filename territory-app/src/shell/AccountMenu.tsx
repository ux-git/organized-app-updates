import { MouseEvent, ReactElement, useState } from 'react';
import { ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import AccountHeaderIcon from '@components/account_header_icon';
import Typography from '@components/typography';

// Organized's account button and menu from the nav bar (layouts/navbar),
// with the entries this app has
export type AccountMenuItem = {
  icon: ReactElement;
  label: string;
  onClick: VoidFunction;
};

const menuStyle = {
  padding: '8px 12px',
  minHeight: '40px',
  height: '40px',
  gap: '8px',
  '&:hover': {
    backgroundColor: 'var(--accent-100)',
    '& p': { color: 'var(--accent-main)' },
    '& svg, & svg g, & svg path, & svg rect': { fill: 'var(--accent-main)' },
  },
};

const AccountMenu = ({
  name,
  subtitle,
  items,
}: {
  name: string;
  subtitle: string;
  items: AccountMenuItem[];
}) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const close = () => setAnchor(null);

  return (
    <>
      <AccountHeaderIcon
        handleOpenMore={(e) =>
          setAnchor((e as MouseEvent<HTMLElement>).currentTarget)
        }
        isMoreOpen={!!anchor}
        sx={{ marginLeft: '2px' }}
      />
      <Menu
        disableAutoFocus
        disableScrollLock
        anchorEl={anchor}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        open={!!anchor}
        onClose={close}
        sx={{
          padding: '8px 0',
          marginTop: '7px',
          '& li': { borderBottom: '1px solid var(--accent-200)' },
          '& li:last-child': { borderBottom: 'none' },
        }}
        slotProps={{
          paper: {
            className: 'small-card-shadow',
            style: {
              borderRadius: 'var(--radius-l)',
              border: '1px solid var(--accent-200)',
              backgroundColor: 'var(--white)',
              minWidth: '294px',
            },
          },
        }}
      >
        <MenuItem
          disableRipple
          sx={{
            cursor: 'default',
            pointerEvents: 'none',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 0,
          }}
        >
          <Typography className="body-small-semibold">{name}</Typography>
          <Typography
            className="label-small-regular"
            sx={{ color: 'var(--grey-350)' }}
          >
            {subtitle}
          </Typography>
        </MenuItem>
        {items.map((item) => (
          <MenuItem
            key={item.label}
            disableRipple
            sx={menuStyle}
            onClick={() => {
              close();
              item.onClick();
            }}
          >
            <ListItemIcon
              sx={{
                '&.MuiListItemIcon-root': {
                  width: '24px',
                  minWidth: '24px !important',
                },
              }}
            >
              {item.icon}
            </ListItemIcon>
            <ListItemText>
              <Typography className="body-regular">{item.label}</Typography>
            </ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default AccountMenu;
