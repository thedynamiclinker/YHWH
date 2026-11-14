Instead of the the File, Edit, View etc. menus usually in lots of apps

The interface should have just one thing that says "Help!" where the File menu usually is.

Clicking on it should present a dialogue saying

```
Help from a higher power

	  Man      God
```

Clicking Man should open a dialogue saying:

You will now see things as root.

- Chroot into `/mnt/root`?

Clicking God should open a dialogue saying

You will now see things as yhwh.

- Chroot into `/mnt/yhwh`?

Once the user chroots into either of those places, their file manager view should change so that it shows the contents of the hierarchies we have here in `./mnt/root/` and `./mnt/yhwh/` respectively, and anything in `./mnt/we/` should appear as if it were bind mounted at that location in both chroots, so anything in `./mnt/we/` is effectively shared between the two chroots.

If we change anything in `./mnt/we` or the other two `./mnt/` subdirs, the changes should automatically appear the next time we open the app.
