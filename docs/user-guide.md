# Travel Organizer — user guide

Everything about one trip that is already decided, booked or saved, on your phone, working
without internet. Not a planner: it holds what you have, so that on the road you can see what
happens next and open the right ticket in seconds.

Written for version **0.3.1**. The examples follow a winter trip to Lapland: flights from Sofia
with a change in Munich, a night train, a hire car, a hotel and a few tours.

**Contents**

1. [Before the trip, at home](#1-before-the-trip-at-home)
2. [Tickets and links](#2-tickets-and-links)
3. [On the road](#3-on-the-road)
4. [Expenses](#4-expenses)
5. [Places and notes](#5-places-and-notes)
6. [Backup and restore](#6-backup-and-restore)
7. [Checklist before you fly](#7-checklist-before-you-fly)
8. [Good to know](#8-good-to-know)

---

## 1. Before the trip, at home

The app is built for this split: you enter things at home, calmly, weeks ahead; you read them
abroad, in a hurry, offline. Entering takes a form or two. Finding things later takes seconds.

### Create the trip

On **Trips**, tap **New trip** (top right).

| Field | What to put |
|---|---|
| **Trip name** | *Lapland* |
| **Destination** | Optional. *Rovaniemi, Finland* |
| **Dates** | First and last day, picked as one range on the calendar. Required. |
| **Main timezone** | Where you will mostly be: *Helsinki*. Search by city or country. Every time you enter is read in this zone **unless that time says otherwise** (see [time zones](#time-zones-per-leg)). |
| **Number of people** | Optional. Handy when tickets are per person. |
| **Travelling with** | Optional, comma separated. |
| **Notes** | Optional. |

**Trips** lists *Upcoming* and *Past* trips. While a trip is under way, the app opens straight into
it.

### Add what is booked

Inside a trip, tap the round **+** at the bottom right (on Now, Timeline, Places or Notes). It
opens **Add to trip**.

1. **What is it**: *Travel*, *Stay*, *Activity*, *Food*, *To do* or *Other*. Then an optional
   **Type** (flight, train, car, hotel, museum, tour…) that picks the icon.
2. **Title**: what you will look for later, e.g. *Santa Claus Express*.
3. **Status**:
   - **Confirmed**: in your itinerary — booked, or simply decided (a walk, a visit with no
     ticket). It shows on the Timeline and Now.
   - **Idea**: saved to Places until you decide on it (see [Places](#5-places-and-notes)).
   - **Cancelled**: kept for its documents, hidden from the Timeline.
4. **When**: *Starts* and, for anything that lasts, *Ends*. A day is enough; add a time if you
   know it. A new item opens on the trip's first day.
5. **Where**: *Place* and *Address*. Place names you have used before are suggested.
6. **Booking**: **Confirmation** code, **Price** and **Currency**, **Paid** (*Not paid yet* /
   *Paid*), **Refundable** (*Refundable* / *Not refundable*, optional).
7. **Notes**: anything worth remembering.
8. **Reminder**: see [Reminders](#reminders).

Tap **Add**. Then attach the tickets (section 2).

**A stay or a journey that ends on another day** gets two Timeline entries: *Check in · Hotel* on
its first day and *Check out · Hotel* on its last; *Departs · Santa Claus Express* and
*Arrives · Santa Claus Express* for a night train.

**Tasks** (*To do*) are dated things to do, such as *Check in for the flight* or *Pack thermal
layers*. They appear under **Open tasks** on Now until you tick **Mark as done**.
A task may be dated before the trip starts; check-in opens a day early, and that is fine.

### Flights with a change, and the way back

For **Travel**, pick how the journey goes:

- **One way**: a single leg.
- **With connections**: tap **+ Add a connection** for each change, e.g. Sofia → Munich →
  Helsinki.
- **With return**: a *Way out* and a *Way back*, each of which can have connections.

Each leg has **From**, **To**, **Departs**, **Arrives**, **Number** (e.g. *OS 796*) and **Seat**.
**Each leg is saved as its own item, with its own times**, so the Timeline shows every flight and
Now counts down to the right one. Put the price on the first leg only; the others stay without
one. An item's detail page lists the **Rest of this journey**.

### Time zones per leg

This is the one thing worth getting right before you fly.

Every time is stored **exactly as you type it** (*06:30*) together with **the zone it is in**. If
you do not set a zone, the trip's main zone is used. On screen the app always shows the time you
typed, wherever the phone happens to be. But the app also works out the real moment from that
time and zone. The countdown, *Up next*, the order of things and reminders all use it.

So a time in a city with a **different clock** from the trip's main zone needs its own zone. On a
Lapland trip (Helsinki time):

| Leg | Departs | Arrives |
|---|---|---|
| Sofia → Munich | 06:30, Sofia: same clock as Helsinki in winter, fine | 07:40, **Munich: set Berlin** |
| Munich → Helsinki | 09:00, **Munich: set Berlin** | 12:05, Helsinki, fine |

Without it, the Munich times are read as Helsinki time, an hour out. The screen still says
*09:00*, but the countdown and the reminder are an hour early.

**The app does it for you on journeys.** When you type a city in a leg's **From** or **To** and
give that end a time, the app looks the city up. If it keeps a different clock from the trip's,
that time's zone is set for you, and the line under it says so:

> 🌐 **Berlin time** ⌄
> *Munich is on a different clock, so this time is in Berlin time.* · **Use Helsinki time**

Tap **Use Helsinki time** if you really mean the trip's clock; it stays that way. A city the app
does not know (or a country with several zones, such as Australia) is left alone. A day without a
time is left alone too.

**By hand:** under every date and time there is a chip such as 🌐 **Helsinki time** ⌄. Tap it,
search a city or country (*Munich* finds Berlin), pick it. **Use the trip's timezone** undoes it.

**Items saved earlier:** a flight whose time is read in the wrong clock says so on its detail page,
under *When*:

> ⚠ *Departs Munich, but this time is read in Helsinki time. Munich is an hour behind.* ·
> **Use Berlin time**

One tap fixes it: the time you typed stays, only its zone changes. Opening the item in **Edit**
shows the same fill, and **Save** fixes it too.

On Now and the detail page, a time in another zone carries a label such as *09:20 · Sofia*; a
time with no label is in the trip's zone, as the trip card says: *Times shown in Helsinki time
unless an item says otherwise.* A **journey's** detail page names the zone at **both** ends
always, even one that follows the trip: *Departs … 09:20 · Sofia time*, *Arrives … 12:15 ·
Helsinki time*. In its form the ends are called *Departs* and *Arrives* (*Pick up* and *Drop off*
for a car).

### Reminders

Each item reminds you once, in **its own** time zone. The **Usual** rule by kind:

| Kind | Usual reminder |
|---|---|
| Travel | 3 hours before |
| Stay | The morning of check-in, at 09:00 (or at check-in, if that is earlier) |
| Activity, Food, Other | 1 hour before |
| To do | At its time |
| Anything with a date but no time | That morning, at 09:00 |

On the item's form, **Reminder** offers *Usual* (it says what that is for the kind), *At the
time*, *15 min before*, *30 min before*, *1 hour before*, *3 hours before*, *That morning*, *The
day before* (same clock time the day before), or *No reminder*. The detail page shows what is set.

The first time something has a reminder, Android asks permission to send notifications. Allow it.
Tapping a reminder opens its item.

### Cancelling and deleting

A **confirmed** item cannot be deleted straight away: its tickets may be the only copies. Use
**Mark as cancelled** first. It leaves the Timeline and Now, keeps its documents, and stays
searchable. A cancelled item offers **Restore** or **Delete**. An idea can be deleted at once.

Deleting a trip (**Edit** on the trip → **Delete trip**) says exactly what goes with it, e.g.
*This also removes 24 items, 2 expenses and 18 saved files.* It cannot be undone.

---

## 2. Tickets and links

The PDF is the point of the app. Everything else exists to find it quickly.

### Attach to an item

On an item's detail page, **Tickets & links**:

- **+ File**: any file, several at once (a ticket per person).
- **+ Photo**: from the gallery. Screenshots of boarding passes work well.
- **+ Link**: a web address, e.g. the hotel's *manage booking* page. It opens in the browser.

The file is **copied into the app**, so it opens without internet and keeps working even if you
delete the original. Tap an attachment to open it; tap its pencil to **rename** it, say what it
is (*Document*, *Ticket*, *Confirmation*), or **Remove attachment**.

**Mark the ticket as *Ticket*.** Then the item's main button opens it straight away — *Open
Boarding pass SOF-HEL* — on Now, the Timeline and the detail page, and everything else sits on a
second button (*Open Flight booking*, or *Other documents (3)*). Several tickets (a boarding pass
each) open a list of just the tickets. A shared or picked file starts as *Document*.

### Trip documents

At the bottom of **Now**, **Trip documents** holds what belongs to the whole trip: insurance, a
guide, a train ticket for everyone. Same **+ File / + Photo / + Link** buttons.

**One file in two places:** to show a trip document on an item too, open it (pencil) and tap
**Also attach to an item**. It is the **same** file, not a copy. Attaching the same PDF twice
with + File makes two separate copies, which works but takes double the space.

### From Gmail, Files or another app

In the other app, **Share** → **Travel Organizer**. The app opens **Save to a trip**: pick the
**Trip**, then **Save as** *An item* (choose **Which item**), *Trip documents* or a *New item*,
then **Save**. Shared links and text work too.

If some of several files cannot be read, the ones that could are kept, and the app says so before
anything else: *Saved 2 of 3 files. Not saved: boarding-pass-3.pdf.* To add the missing one,
share it again and choose **An item** → the item it names — sharing to *New item* again would make
a second item. If none could be read, or saving fails, nothing is saved at all.

**Gmail** cannot share a whole email. To keep a booking email:
open it → **⋮** → **Print** → **Save as PDF** → share that PDF to the app.

### When a file is missing

If a file has gone (rare: a backup restored without it), its row turns red and says **File
missing from this phone** instead of opening nothing. Attach it again.

---

## 3. On the road

### Now

The trip opens on **Now**:

- **Happening now**: what is on right now — the tour you are five minutes late for, the train you
  are on — with its ticket one tap away. It stays until **15 minutes after its end** (*Ended
  16:00*), or **an hour after its start** if it has no end. Hotel stays and anything longer than a
  day are not shown here; during a stay its *Check out* is in Up next.
- **Today, no fixed time**: plans for today with only a date, such as *Santa Claus Village*, all
  day long — in the place's own time zone. **Maybe today** lists ideas dated today, apart.
- **Up next**: what happens next, with the time and route, and **Open attachments** to reach the
  tickets in one tap. It follows the items, not the trip's dates, so a flight the day before the
  trip shows up too. Tasks are not here; they are under Open tasks.
- **Open tasks**: tick them off (**+** adds one).
- **This trip**: dates, who is travelling, which zone times are shown in.
- **Trip documents**.

### Timeline

Every dated item, **day by day**, in time order. Each day is the **local** day where it happens:
a 23:30 dinner stays on its own evening. Tap an entry for its detail page. Cancelled items are
not shown.

**During the trip** it opens on **today** (marked *Today*), or the next day with something on
it; earlier days are still above. **Today** at the top brings you back. It never jumps on its
own while you read another day. Before and after the trip it starts at the beginning.

### Search

The magnifier at the top of a trip searches **titles, places, references and notes**, including
confirmation codes and cancelled items. Results are split into *Items* and *Notes*.

### Offline

Everything is on the phone. In airplane mode the Timeline, Now, search, notes, expenses and
**every attached file** work as usual. Files open in your phone's viewer (PDFs in the PDF viewer,
photos in Photos). Links need internet, since they open web pages.

### Item details

Shows the times (with zones where they differ), the route, number and seat, confirmation code,
price and whether it is paid or refundable, the reminder, **Open in Maps** for an address, the
tickets, and the status actions.

---

## 4. Expenses

The **Expenses** tab (between Places and Notes) answers *what does this trip cost?* At the top, the
**trip total** per currency, split into **Bookings** and **Spending**. Below, two views:

### Spending

What you pay for **during** the trip: a taxi, groceries, a souvenir.

On the Expenses tab, **+** opens **New expense**:

| Field | |
|---|---|
| **Amount** | The keyboard opens on it. Decimals as typed: *12.50*. |
| **Currency** | Starts as the one you used last on this trip (EUR at first). Delete it and type another: *HUF*, *CHF*. |
| **Category** | *Food & drink*, *Groceries*, *Transport*, *Activities*, *Shopping & souvenirs*, *Accommodation*, *Other*. Required. |
| **Label** | Optional. Without one, the expense is called by its category. |
| **Date** | Today by default. |
| **Description** | Optional. |
| **Receipts** | **+ Camera** (photograph it at the till), **+ Photo**, **+ File**. |

Tap **Save expense**. The view shows a bar per category, then each expense by day; a paperclip
marks one with receipts. Tap an expense to edit it, add or open receipts, or **Delete expense**
(it says how many receipts go with it).

Receipts belong to their expense. They are **not** listed under Trip documents, and they are in
the backup.

**Camera permission:** the first **+ Camera** asks for it. If you refuse, the app says *The
camera is not allowed* and offers **Open Settings** (Permissions → Camera → *Allow only while
using the app*).

### Bookings

The prices on the trip's items: what is **Paid** and what is still **To pay**, item by item. It
counts confirmed items, plus cancelled ones marked *Not refundable* (money you will not get back).
Ideas are not counted.

### Currencies

Amounts in different currencies are **never converted or added together**. A trip in euros with
one forint taxi shows two totals, one per currency.

*Splitting costs between people (who paid, who owes whom) is planned as a later version.*

---

## 5. Places and notes

### Places

Things you might do, not booked yet: a café someone recommended, a viewpoint, a museum. Add them
with **Status: Idea** and **How much do you want it** (*Must*, *Want*, *Maybe*).

**Places** lists **Ideas**, sorted by how much you want them, and then **In your itinerary**:
confirmed items that have an address, so the whole map of the trip is in one list. When you decide
on an idea, open it and tap **Add to itinerary**: give it a date (a day is enough) and it becomes
a confirmed item.
Nothing is copied; it is the same item.

### Notes

Free text per trip: a plan, opening hours, the cabin's key code. **New note**, a title and the
text. **Pin** keeps a note at the top. Notes are searchable.

---

## 6. Backup and restore

Everything lives **only on this phone**. There is no account and no cloud. A backup is the only
copy anywhere else, so it is the one habit that matters.

### Make one

On **Trips**, tap **Backup** (top right) → **Export everything**. The app builds one zip with
every trip, item, note, expense and saved file, and opens the share sheet. Pick **Drive** (or
anywhere off the phone). The screen then says what went in: *Backed up 2 trips and 30 saved
files.*

**When:** before every trip, after adding the last tickets. Also after any big round of changes.

### Restore one

**Backup** → choose **When a trip is already on this phone**:

- **Keep mine**: adds the trips that are not on this phone; trips already here stay exactly as
  they are. Safe to run twice.
- **Use the backup's**: a trip that is already here is replaced by the backup's copy.

Then **Import a backup** and pick the zip (from Drive, Downloads…). The app says what it will do
before doing anything, e.g. *Adds 1 trip, 24 items, 2 notes, 2 expenses and 18 saved files. 1
trip already here is left as it is.* Tap **Import**. It runs all at once or not at all: if
anything fails, nothing on the phone has changed.

Backups made by older versions of the app still restore.

### A new phone, or after a reinstall

Install the app, open it, **Restore from a backup** on the empty Trips screen, pick the latest zip
from Drive. Allow notifications when asked, so reminders come back.

**Updating the app keeps your data.** It is installed over the old version. Uninstalling deletes
everything, so make a backup first if it ever comes to that.

---

## 7. Checklist before you fly

At home, on wifi, a day or two before:

1. **Every booking is in**, confirmed, with its date and time.
2. **Time zones**: open each flight's detail page. No ⚠ notice under *When* means its times are
   read in the right clock. Both ends name their zone (*Departs … 08:15 · Berlin time*): check
   each is where that end really is.
3. **Tickets attached**: open each one once, and mark each as *Ticket* so its card opens it in one tap.
4. **Airplane mode test**: switch it on, open the trip, open every ticket, switch it off.
5. **Reminders** on where you want them; notifications allowed.
6. **Backup**: Export everything → Drive.
7. Glance at **Expenses → Bookings**: anything still *To pay*?

On the road: Now shows what is happening and what is next; a ticket marked *Ticket* is one tap
away on its card.
Photograph receipts as you pay.

---

## 8. Good to know

- **Nothing leaves the phone** unless you share it: no account, no sync, no tracking.
- **Times never shift** when the phone changes zone. A flight entered as 06:10 reads 06:10 in
  Sofia, Munich or Helsinki.
- **Items may be dated outside the trip** (check-in the day before, a restaurant booked weeks
  earlier). They still show on the Timeline and Now.
- **Deleted files are cleaned up** when the app next starts, not at the moment of deleting.
- **A price is stored exactly**: *412.37* stays 412.37, never rounded.
