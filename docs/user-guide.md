# Travel Organizer — user guide

Everything about one trip that is already decided, booked or saved, on your phone, working
without internet. Not a planner: it holds what you have, so that on the road you can see what
happens next and open the right ticket in seconds.

Written for version **0.6.0**. The examples follow a winter trip to Lapland: flights from Sofia
with a change in Munich, a night train, a hire car, a hotel and a few tours.

**Contents**

1. [Before the trip, at home](#1-before-the-trip-at-home)
2. [Tickets and links](#2-tickets-and-links)
3. [On the road](#3-on-the-road)
4. [Expenses](#4-expenses)
5. [Places, notes and lists](#5-places-notes-and-lists)
6. [Backup and restore](#6-backup-and-restore)
7. [Checklist before you fly](#7-checklist-before-you-fly)
8. [Good to know](#8-good-to-know)
9. [Travellers, templates and the itinerary PDF](#9-travellers-templates-and-the-itinerary-pdf)

---

## 1. Before the trip, at home

The app is built for this split: you enter things at home, calmly, weeks ahead; you read them
abroad, in a hurry, offline. Entering takes a form or two. Finding things later takes seconds.

### Create the trip

On **Your trips**, tap **New trip** (top right).

| Field | What to put |
|---|---|
| **Trip name** | *Lapland* |
| **Destination** | Optional. *Rovaniemi, Finland* |
| **Dates** | First and last day, picked as one range on the calendar. Required. |
| **Main timezone** | Where you will mostly be: *Helsinki*. Search by city or country. Every time you enter is read in this zone **unless that time says otherwise** (see [time zones](#time-zones-per-leg)). |
| **Number of people** | Optional. Handy when tickets are per person. |
| **Travelling with** | Optional, comma separated. For trips made before 0.6.0; the people on a trip are now chosen under **Travellers** (see [section 9](#travellers)). |
| **Notes** | Optional. |

If you have saved a **template**, the app then offers one: pick it, or **Skip — a blank trip**
(see [Templates](#templates)).

**Your trips** shows the next trip as a large card with its route, then *Upcoming* and *Past*
trips, then **Your data**: *Lists & templates*, *Travellers* and *Backup & restore*. While a trip
is under way, the app opens straight into it.

### Add what is booked or planned

Inside a trip, tap **Add** at the top right (on the Overview or the Timeline). It opens **Add to
this trip**: pick what it is — *Travel*, *Stay*, *Activity*, *Food*, *To do* or *Other*. On
Places the same button says **Save a place**, on Expenses **Add an expense**, on Notes & lists
**Add a note** or a list.

Every item carries an **icon of what it is** — a plane, a train, a bed, a museum, a fork and knife,
a ticked box for a task — in a small tile whose shape tells the kinds apart. The icon follows the
*Type* you pick (*Flight*, *Museum*…), or the kind when there is no type.

The form, top to bottom:

1. **What is it** (tap to change it) and an optional **Type** (flight, train, car, hotel, museum,
   tour…) that picks the icon.
2. **Title**: what you will look for later, e.g. *Santa Claus Express*.
3. **Commitment**:
   - **In my itinerary** (the default): booked, or simply decided (a walk, a visit with no
     ticket). It shows on the Timeline and the Overview.
   - **Saved idea**: kept on Places until you decide on it (see [Places](#places)). *Save a
     place* starts here.

   Cancelling is not on the form; it is in the item's **More** menu.
4. **When**: *Starts* and, for anything that lasts, *Ends* (*Departs* and *Arrives* for travel). A
   day is enough; add a time if you know it. A new item opens on the trip's first day, or on the
   day you were looking at on the Timeline.
5. **Where**: *Place* and *Address*. Place names you have used before are suggested.
6. **Booking reference**, e.g. *ABC123*.
7. **Who's going**, when the trip has travellers: tick who this is for. A new plan or saved place
   starts with **everyone on the trip ticked** — untick whoever is not going; a new to-do starts with
   nobody. Nobody ticked means *not said* — never "everyone". Editing keeps who you ticked before,
   even if someone joined the trip since.
8. **Price & payment** (folded until you open it): **Total price**, or **Breakdown** — lines that
   add up to the total, worked out for you and shown with its working:
   - **Add a rate**: a price per person, e.g. *2 × EUR 290.00*, **For** *Adult*, *Child* or
     *Anyone* (or left unset). A price of 0 is free — *1 × free Child*.
   - **Add a group price**: one fixed price for a group, e.g. *Family ticket EUR 120.00*.
   - **Add an extra**: things or services, not people, e.g. *Extra: 2 × EUR 20.00 Sled hire*.

   When the people ticked under *Who's going* do not match the rates, it says so (*Priced for 3;
   4 are going*) and offers **Price for who's going**: it shows the price now and the price for who
   is going, side by side, and changes nothing until you tap **Apply**. Adults go on the Adult
   rate, children on the Child rate, anyone else — or anyone without a rate of their own — on
   *Anyone*; nobody is ever assumed to be an adult. Extras and group prices are never changed. If
   the booking is marked **Paid**, you see the calculation but no Apply: the app does not know how
   much was paid. Changing who is going never changes a price.

   Then **Paid** (*Not paid yet* / *Paid*) and **Refundable** (optional). Changing the price of a
   booking already marked paid warns you: Paid stays, and so it would cover the new price too.
   On a saved place (an idea) the price is an **estimate** — *Estimated price* — never a payment.

   A booking then carries a second pill on the Overview, the Timeline, Places and its own page:
   **To pay** (red, with a wallet) when it has a price above zero and is not paid, **Paid** (grey,
   with a tick) when it is marked paid. A free item (no price, or a price of 0) owes nothing and
   shows nothing. Ideas and cancelled items never show it. The legs of a journey share the first
   leg's pill, since the price sits there.

   Amounts are read exactly as typed: *12.50* and *12,50* are both twelve fifty. Something the
   app cannot read for certain, such as *1.234*, is refused with a message rather than guessed.
9. **Notes**: anything worth remembering.
10. **Reminder** (folded): see [Reminders](#reminders).

**Save** stays at the bottom of the screen; it says **Add** on a new item and **Save changes**
when editing. Then attach the tickets (section 2).

**A stay or a journey that ends on another day** gets two Timeline entries: *Check in · Hotel* on
its first day and *Check out · Hotel* on its last; *Departs · Santa Claus Express* and
*Arrives · Santa Claus Express* for a night train.

**Tasks** (*To do*) are dated things to do, such as *Check in for the flight* or *Pack thermal
layers*. They appear on the Overview — under **Get ready** before the trip, **To do** during it —
until you tick them. Ticking one shows **Undo** for 8 seconds. A task may be dated before the trip
starts; check-in opens a day early, and that is fine. Tasks are not on the Timeline.

### Flights with a change, and the way back

For **Travel**, pick how the journey goes:

- **One way**: a single leg.
- **With connections**: tap **+ Add a connection** for each change, e.g. Sofia → Munich →
  Helsinki.
- **With return**: a *Way out* and a *Way back*, each of which can have connections.

Each leg has **From**, **To**, **Departs**, **Arrives**, **Number** (e.g. *OS 796*) and **Seat**.
**Each leg is saved as its own item, with its own times**, so the Timeline shows every flight and
the Overview counts down to the right one. The price goes on the first leg only; the others stay
without one. An item's detail page lists the **Rest of this journey**.

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

On the Overview and the detail page, a time in another zone carries a label such as *09:20 ·
Sofia time*; a
time with no label is in the trip's zone. A **journey's** detail page names the zone at **both** ends
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

On an item's page, **Edit** is at the top right, and **More** beside it holds **Mark as
cancelled** and **Delete** (and **Add to itinerary** on an idea). A booking cannot be deleted straight away: its tickets may be the only copies. **Mark as cancelled**
first. It leaves the Timeline and the Overview, keeps its documents, and stays searchable. A
cancelled item offers **Restore to the itinerary** or **Delete**. An idea can be deleted at once.

Deleting a trip (Overview → **More** → **Edit trip** → **Delete trip**) says exactly what goes with it, e.g.
*This also removes 24 items, 2 expenses and 18 saved files.* It cannot be undone.

---

## 2. Tickets and links

The PDF is the point of the app. Everything else exists to find it quickly.

### Attach to an item

On an item's detail page, the tickets come first, under **Tickets & links**:

- **+ File**: any file, several at once (a ticket per person).
- **+ Photo**: from the gallery. Screenshots of boarding passes work well.
- **+ Link**: a web address, e.g. the hotel's *manage booking* page. It opens in the browser.

The file is **copied into the app**, so it opens without internet and keeps working even if you
delete the original. A photo shows a small round picture of itself in the list; a PDF says *PDF*,
a link *LINK* or *MAP*. Tap an attachment to open it; tap its pencil to **rename** it, say what it
is (*Document*, *Ticket*, *Confirmation*), or **Remove attachment**.

**Mark the ticket as *Ticket*.** Then the item's main button opens it straight away — *Open
Boarding pass SOF-HEL* — on the Overview, the Timeline and the detail page, and everything else sits on a
second button (*Open Flight booking*, or *Other documents (3)*). Several tickets (a boarding pass
each) open a list of just the tickets. A shared or picked file starts as *Document*.

### Trip documents

On the Overview, the **Trip documents** row opens every document of the trip in one list:
tickets first, then **For the whole trip** — insurance, a guide, a train ticket for everyone, with
the same **+ File / + Photo / + Link** buttons — then each item's files in itinerary order. Each
says whether it is on this phone, a link, or missing.

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

### Overview

At the bottom of a trip, five tabs: **Overview**, **Timeline**, **Places**, **Expenses** and
**Notes & lists** (just *Notes* on a narrow phone or with large text). The one you are on is
marked by a short bar above it and a bolder label. Every tab but Overview names the trip above its
title.

The trip opens on its **Overview**. The top line says where and when, and **Full itinerary** opens
the Timeline. Below it, one large panel shows the thing that matters most:

- **Before the trip**: **Your first departure**, with the countdown, its route and the zone, and
  its ticket one tap away. Then **Get ready** (your tasks), **Coming up**, **Stay & transport**
  (where you sleep and the car you hire), your **Lists** with how far along each is (*Packed 3 of
  12*), **Travellers** and **Trip documents**.
- **During the trip**: **+ Add expense** right at the top (§4, *Quick expense*), then **Happening now** — the tour you are five minutes late for, the train you
  are on — or **Next**, with its ticket one tap away. A happening thing stays until **15 minutes
  after its end**, or **an hour after its start** if it has no end. Then **Today, no fixed time**
  (plans for today with only a date), **Maybe today** (ideas dated today), **Also on now**,
  **After that**, **Your stay** (checked in, check-in today, the next stay, or a night on a train or
  ferry — with its directions and confirmation) and **To do**. A hotel you are staying in never
  takes the big panel away from the flight or tour that comes next.
- **After the trip**: a calm summary — the places you went and what the trip cost, per currency —
  with no countdown.

It follows the items, not the trip's dates, so a flight the day before the trip shows up too.

**More** (top right) holds **Edit trip**, **Share as PDF**, **Use a template** and **Save as
template**.

### Directions

**How to get there** on an item's page, **Directions** on Overview's big panel, and the quiet
*Directions to …* rows between two plans on the Timeline open a small sheet: **To** is the plan,
**From** is your current location, the previous stop, the stay for that day, or another saved
place; pick a **travel mode** if you like, then **Open in Google Maps**. Google Maps works out where
you are — the app never asks for your location. If Maps cannot open, the app offers **Copy
address**.

### Timeline

Every dated plan, **day by day**, in time order. Each day is the **local** day where it happens: a
23:30 dinner stays on its own evening. Tap an entry for its detail page. Cancelled items and tasks
are not shown.

Across the top, a **rail** of stops: **All days**, then *Before* when something is dated before the
trip, **every day of the trip** (*Day 3 · Sun 22*), *After*, and *No date* when a plan has no date
yet. Tap a day to see just that day; a day with nothing on it says so and offers **Add a plan** for
that date. **During the trip** it opens on today, and **Today** brings you back.

### Search

The magnifier at the top of a trip searches **titles, places, references and notes**, including
confirmation codes and cancelled items. Results are split into *Items* and *Notes*.

### Offline

Everything is on the phone. In airplane mode the Timeline, the Overview, search, notes, lists,
expenses and
**every attached file** work as usual. Files open in your phone's viewer (PDFs in the PDF viewer,
photos in Photos). Links need internet, since they open web pages.

### Item details

The ticket first, then both ends of a journey each with its zone, the route, number and seat, the
**Booking reference** with **Copy** (paste it at the desk or into the airline's app), who is going,
the price — with its working when it is per person — and whether it is paid or refundable, the
reminder, and **Open in Maps** for an address. **More** holds the rest.

---

## 4. Expenses

The **Expenses** tab answers *what does this trip cost?* At the top, the **trip total** per
currency. Below, two views, **Bookings** and **Spending**:

### Spending

What you pay for **during** the trip: a taxi, groceries, a souvenir.

**Paying for something already booked** — the hotel at check-out, say — is not a new expense: open
the booking and mark it **Paid**. Its price is already in the trip total, so adding it here as well
would count it twice. The form says so under the amount.

On the Expenses tab, **Add an expense** opens **New expense**:

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
marks one with receipts. Tap an expense for its page: the amount, the date, the description and
its receipts (open them, or add more). **Edit** at the top changes it; **Delete expense** at the
bottom removes it (it says how many receipts go with it).

**Quick expense.** During the trip, Overview's **+ Add expense** opens a short sheet — amount,
currency, category, date, an optional label — with **Take photo** and **Choose photo** for the
receipt. Close it without saving and any photo you took is thrown away. A quick expense is an
ordinary expense: it shows on the Expenses tab and in the backup.

Receipts belong to their expense. They are **not** listed under Trip documents, and they are in
the backup.

**Camera permission:** the first **+ Camera** asks for it. If you refuse, the app says *The
camera is not allowed* and offers **Open Settings** (Permissions → Camera → *Allow only while
using the app*).

### Bookings

The prices on the trip's items: what is still to pay and what is **Paid**, item by item. A booking
priced at 0 is free and not listed. It counts confirmed items, plus cancelled ones marked *Not refundable* (money you will not get back).
Ideas are not counted.

A cancelled booking you never marked either way is **not counted** — the total is what the trip is
expected to cost — but it is **listed** under **Refund not specified**: *EUR 290.00 cancelled,
refund not specified — not counted above.* Open it and say *Refundable* or *Not refundable*.

### Currencies

Amounts in different currencies are **never converted or added together**. A trip in euros with
one forint taxi shows two totals, one per currency.

*Splitting costs between people (who paid, who owes whom) and converting to one currency are
planned for later versions.*

---

## 5. Places, notes and lists

### Places

Things you might do, not decided yet: a café someone recommended, a viewpoint, a museum. Add them
with **Save a place**, and say **How much do you want it** (*Must*, *Want*, *Maybe*).

**Places** has two views: **Saved** — your ideas, grouped *Must*, *Want*, *Maybe* — and **In
itinerary**: plans that have an address, so the whole map of the trip is in one list. When you decide
on an idea, open it and tap **Add to itinerary**: give it a date (a day is enough) and it becomes
a confirmed item.
Nothing is copied; it is the same item. The list shows no prices or payment pills — those are on
the item's page and in Expenses.

### Notes

The **Notes & lists** tab has three views: **Notes**, **Packing** and **Shopping**.

Notes are free text per trip: a plan, opening hours, the cabin's key code. **Add a note**, a title
and the text. **Pin** keeps a note at the top. Each shows its title and the first two lines.
Notes are searchable.

### Packing and shopping lists

Keep your lists once, under **Your trips → Lists & templates**, and copy them into each trip. The
first time, **Add the starting lists** gives you *General packing*, *Winter layers*, *Child
essentials* and *Toiletries to buy* to edit.

In a trip, **Packing** or **Shopping** → **Add a packing list** (or shopping list) copies one of
yours, or starts an empty one. The copy belongs to the trip: ticking it, adding to it or removing
from it never changes your kept list, and the kept list's later changes never reach the trip.
Copying the same list twice asks first.

Each line has **What**, and optionally **How many**, a **Unit**, a **Group** (*Clothes*,
*Toiletries*…), a **Note**, and who it is **For** — tick one person, several, or nobody: *Hand
warmers* for you, Misho and Mitko is one line, still the quantity you typed. The list then reads
*For Evelina, Misho*, or *For Everyone* when every traveller on the trip is ticked (someone who
joins the trip later is not added to old lines). Someone missing? **+ Add new traveller** puts a
saved person on the trip, or adds someone new, and ticks them. Tap the box to tick it — packed, or bought —
and **Undo** shows for 8 seconds. Ticked lines fold away under *Packed (8)* or *Bought (3)*. *Packed 8 of 12* counts
lines, not pieces.

**Bought is not packed.** On a shopping line, **Add to packing list** puts it on the trip's packing
list, unticked. Nothing in a list ever becomes an expense.

A trip's list can be kept for next time with **More → Keep for next trips**; one that came from a
kept list can also **Update** that list.

---

## 6. Backup and restore

Everything lives **only on this phone**. There is no account and no cloud. A backup is the only
copy anywhere else, so it is the one habit that matters.

### Make one

On **Your trips**, under *Your data*, tap **Backup & restore** → **Export everything**. The app
builds one zip with every trip, item, note, expense, traveller, list, template and saved file, and opens the share sheet. Pick **Drive** (or
anywhere off the phone). The screen then says what went in: *Archive created with 2 trips and
30 saved files.* The app cannot see where the share sheet put the zip — or whether it was closed
without saving — so check that the file arrived in Drive. Each zip is named with the date and
minute it was made, `travel-organizer-backup-2026-10-13-0942.zip`, so the newest is easy to find.

**Size.** The zip is built on the phone, in its memory. Tested on a smaller emulator than the
phone: a backup of 380 MB exported, and one holding a single 150 MB file both exported and
restored. Tickets and photos are a few MB each, so this leaves a wide margin.

**When:** before every trip, after adding the last tickets. Also after any big round of changes.

### Restore one

**Backup** → choose **When a trip is already on this phone**:

- **Keep mine**: adds the trips that are not on this phone; trips already here stay exactly as
  they are. Safe to run twice.
- **Use the backup's**: a trip that is already here is replaced by the backup's copy.

Then **Import a backup** and pick the zip (from Drive, Downloads…). The app says what it will do
before doing anything, e.g. *Adds 1 trip, 24 items, 2 notes, 2 expenses and 18 saved files. 1
trip already here is left as it is.* Your travellers, kept lists and templates follow the same
choice: *Keep mine* adds only the ones this phone does not have. Tap **Import**. It runs all at once or not at all: if
anything fails, nothing on the phone has changed.

Backups made by older versions of the app still restore.

### A new phone, or after a reinstall

Install the app, open it, **Restore from a backup** on the empty *Your trips* screen, pick the latest zip
from Drive. Allow notifications when asked, so reminders come back.

**Updating the app keeps your data.** It is installed over the old version. Uninstalling deletes
everything, so make a backup first if it ever comes to that.

---

### One trip to another phone

**Overview → More → Export trip** makes a file with just this trip: plans, bookings, notes, lists,
travellers, expenses and — with **Complete trip** — every document and receipt photo. **Without
attachments** leaves the files out; the documents are still listed and arrive as missing. Your other
trips, your backups and which traveller is you are never in it. Anyone with the file can read the
whole trip, so share it with care.

On the other phone: **Your trips → Backup & restore → Import a trip**, choose the file, and look
through the preview before anything is added. It always becomes a **new** trip — nothing already
there changes. Each traveller in it becomes a new person unless you link them to someone saved
(the app suggests people with the same name and shows their trips, but never links by itself).
Importing the same trip again makes another copy, after a warning. A full backup is restored with
**Import a backup** instead; each button tells you if you picked the other kind of file.

### Plan with ChatGPT: import activities

You can plan with an AI assistant and bring its suggestions into a trip without typing them.

1. Open the trip → **More → Import activities → Copy instructions for ChatGPT**.
2. Paste them into a chat and describe your trip. The instructions ask it to write a file in the
   Travel Organizer format and not to invent dates, prices or bookings.
3. Save its answer as a `.json` file (on the phone, or send it to yourself), then **Choose a file**.
4. Look through the list. Everything is ticked except:
   - **invalid** activities — greyed, with what is wrong (a date that does not exist, a time like
     25:00, *booked* as a status…); fix the file and choose it again;
   - **possible duplicates** — something with the same title on the same day, or at the same place
     and time, already in the trip or earlier in the file. The line says which. Tick it to add it
     anyway.
   Anything the app does not import (booking references, per-person prices, who is going…) is
   listed under *Not imported*.
5. **Add**. Ideas go to **Places**, planned activities to the **Timeline** (*No date yet* when they
   have no date). A planned activity with a price shows in Expenses as **to pay** — an estimate is
   never a payment — and a planned one still ahead gets the usual reminder. Nothing already in the
   trip changes.
6. **Review imported activities** lists what was just added; open one to check, edit or delete it.

*Share the format* sends the technical description (a JSON Schema) to anyone or any tool that needs
it. The full description, with an example to copy, is `docs/ai-activities-format.md`.

### Plan with AI

**More → Plan with AI** turns the trip into a short text for ChatGPT or another assistant, so you
don't have to describe it again.

1. **What would you like help with?** — *Improve my itinerary*, *Fill free time*, *Is it too busy?*,
   *Places to eat*, *General planning*, or *In my own words* (what you type goes in exactly as typed).
2. **What to include** — the destination, dates and what is planned are always in. *Ideas not
   decided yet* is on; *Where we stay* (the place name for each night, never the address) and *Who
   is travelling* (numbers of adults and children, never names) are off unless you switch them on.
3. **Exactly what will be shared** — read it. Titles and place names are cleaned of booking
   references, emails, links and phone numbers, but that is not a guarantee: if a title holds
   something private, change the title first.
4. **Copy for ChatGPT** or **Share** — exactly the text you see. The app sends nothing by itself.

Ask the assistant for *activities to import* and it can reply in the activities format; save the
reply as a `.json` file and use **Import activities**. Nothing in your trip changes until you do.

### Export activities

**More → Export activities**: tick the ideas and plans you want (filter **All · Ideas · Planned**)
and **Share**. The file has titles, kinds, dates, times, places, notes, prices, website and map
links — never booking references, who is going, documents, whether something is paid, or which
traveller is you. To-dos and cancelled plans are not offered. The file can be imported into any
trip, on this phone or another.

## 7. Checklist before you fly

At home, on wifi, a day or two before:

1. **Every booking is in**, confirmed, with its date and time.
2. **Time zones**: open each flight's detail page. No ⚠ notice under *When* means its times are
   read in the right clock. Both ends name their zone (*Departs … 08:15 · Berlin time*): check
   each is where that end really is.
3. **Tickets attached**: open each one once, and mark each as *Ticket* so its card opens it in one tap.
4. **Airplane mode test**: switch it on, open the trip, open every ticket, switch it off.
5. **Reminders** on where you want them; notifications allowed.
6. **Packing list** copied into the trip, and ticked as you pack.
7. **Backup**: Export everything → Drive.
8. Glance at **Expenses → Bookings**: anything still *To pay*?
9. If someone at home wants the plan: Overview → **More** → **Share as PDF**.

On the road: the Overview shows what is happening and what is next; a ticket marked *Ticket* is one tap
away on its card.
Photograph receipts as you pay.

---

## 8. Good to know

- **Nothing leaves the phone** unless you share it: no account, no sync, no tracking.
- **Times never shift** when the phone changes zone. A flight entered as 06:10 reads 06:10 in
  Sofia, Munich or Helsinki.
- **Items may be dated outside the trip** (check-in the day before, a restaurant booked weeks
  earlier). They still show on the Timeline (under *Before* or *After*) and on the Overview.
- **Deleted files are cleaned up** when the app next starts, not at the moment of deleting.
- **A price is stored exactly**: *412.37* stays 412.37, never rounded.

---

## 9. Travellers, templates and the itinerary PDF

### Travellers

**You.** Under **Your trips → Travellers → Which traveller are you?** tell the app which profile
is you — choose yours if you are already saved (do not make a second one), or add yourself. You then
show as *Evelina (Me)* wherever people are chosen, and every **new** trip starts with you ticked.
Trips made before are listed under **Trips you are not on yet**: tick the ones to join and confirm.
That adds you to the trip only — who goes to each booking, prices, expenses and lists stay exactly
as they were. "Me" is only on this phone; it is not an account.

The people you travel with are kept once, under **Your trips → Travellers**: a name, and whether
they are an **Adult**, a **Child** or *Not specified* — no birth dates. When you create or edit a
trip, tick who is going (two people with the same name are told apart by that badge), or **Add new
traveller** without leaving the form. On a trip, Overview → **Travellers** changes who is going, and
can mark someone differently for just this trip — a twelve-year-old on an adult ticket, say. A
price breakdown then suggests one rate for adults and one for children. Then each booking can
say **Who's going** — tick a subset when not everyone goes. Renaming someone renames them
everywhere.

**Someone joins a trip that already has plans.** After you add them on the trip's Travellers page,
**Also add *name* to…** lists the trip's plans (upcoming first) and saved places, **all unticked**:
tick the ones they are going to and tap **Add to N items**, or **Not now** — nothing is added unless
you tick it, and prices and payments do not change. To do it later, tap them under *Going* and
choose **Add to existing plans…**. Removing someone from a trip takes them off its plans; adding
them back does not put them back on — the list offers the plans again. Activities imported from a
file (Import activities) start with nobody ticked. Two of your travellers with the same name are
told apart under *Your travellers* by a line such as *Adult · On Lapland*. Someone still on a trip or a booking cannot be deleted; the app says where they are
used.

A trip made before 0.6.0 keeps the names typed in its *Travelling with* field. Its Travellers page
lists them, and each becomes a profile only when you tap it (**Make a traveller**, or **Use “Evelina”**
when a traveller of that name already exists). Nothing is matched up across trips by itself.

### Templates

A template is your usual preparation — tasks, notes and lists — never bookings, prices or tickets.
On a trip you have prepared well: Overview → **More** → **Save as template**, choose what goes in,
name it. A task keeps its distance from the trip's first day: *2 days before* stays two days before
on the next trip, at the same time.

Use one when creating a trip (the app offers it), or later from Overview → **More** → **Use a
template**. Everything is copied into the trip, lists unticked; later changes to the template never
reach the trip, nor the other way round. Using the same template on a trip again asks first.
Templates are listed, renamed and deleted under **Lists & templates**.

### Share the itinerary as a PDF

Overview → **More** → **Share as PDF** makes a printable plan for someone at home, or for paper:
stays and travel at a glance, then every day of the trip with its times, places and zones, both
ends of each journey. Tickets are **named, not attached**. It is made on the phone, offline, and
opens the share sheet (Drive, Messages, Print…).

Choose what goes in. **Notes on each plan** is on; **Booking references**, **Who is going**,
**To do**, **Packing and shopping lists** and **Booking costs** are off until you switch them on —
anyone holding the PDF can read whatever is in it. The PDF is a snapshot: make a new one after
changes.

## Payments on a booking (0.14.0, not yet on your phone)

- On a booking with a price, **Payments** shows what is paid and what is left. **Add a payment**
  records a deposit or the rest: the amount starts at what is left, *Paid by* stays *Not recorded*
  unless you pick someone (the last payer is offered as a button), and the date starts at today.
- The *Paid* switch still means *paid in full*. If you add a payment to a booking already marked
  *Paid*, the rest shows as *not recorded by whom*.
- Paying for a booking during the trip? In the expense, choose it under **For a booking**: it then
  counts as paid on the booking, not as extra spending. If an expense's amount matches a booking,
  the app asks before saving. **Unlink from booking** on the expense makes it spending again.
- A booking with payments cannot be deleted; cancel it, or delete its payments first. Someone who
  paid cannot be removed from the trip. Deleting a whole trip says how many payments go with it.

## Splitting a cost (0.15.0, not yet on your phone)

- On a booking or an expense, **Split it** says who the cost is for. *Equally* divides the price;
  *By amounts* lets you type each share, and tells you what is left until it adds up. Nothing is
  split unless you do it — *Who's going*, *Everyone on the trip* and *Fill from prices* only fill the
  screen for you to check. *Fill from prices* needs each person rate on the price marked *Adult*,
  *Child* or *Anyone*; if one is not, it says so and you split equally or type the amounts.
- If the price, its currency or the saved split changes while the split screen is open, or someone
  you ticked leaves the trip or changes between adult and child, the screen says what changed and
  will not save until you choose *Keep my changes* or *Start again from the saved split*. Someone
  who left the trip stays in your changes until you tap *Take … out*; what they had is then left to
  split, never given to someone else.
- **Covered by:** on the trip's Travellers, tap a child to choose the adult or adults who cover their
  share (several share it equally). On one cost you can name someone else. A child's share nobody
  covers says *not covered*.
- If you change the price, an equal split follows it; a split by amounts stays and shows *Does not
  add up* until you edit it. You cannot change the currency of a cost split by amounts.
- Someone who paid, is in a split or covers a share cannot be removed from the trip. **See the
  records** lists each one; change them, then remove the person.
- Deleting a booking, an expense or a trip tells you which splits go with it.

## Who owes whom (0.16.0–0.16.1, not yet on your phone)

- On a trip with two or more people, **Expenses → Settle up** shows, for each currency, what each
  person paid, their share (their own, and a child's they cover), what they settled, and where they
  stand. Tap a person to see every line behind it.
- Only **complete** costs count: split, adding up, every child covered, every payment with a payer,
  and paid in full. Anything else is listed under **Not in the balances yet** with why — *EUR 150.00
  to pay*, *Paid — not recorded by whom*, *not covered* — and what has been paid on it. Tap it to finish
  it. Costs nobody split are folded away under **Not split**; they never count.
- While a cost in a currency is not complete, that currency shows **Balances so far** and suggests
  nothing: the figures read *+… so far* or *−… so far*, not debts. Once everything is complete it shows
  **Balances** and **Suggested transfers** (*Ben pays Ana EUR 15.00*). Each currency on its own;
  nothing is converted.
- Tap a suggestion to record it — change the amount for a part payment — or **Record a settlement**
  for any money one person gave another. If it is more than they owed, or in a currency with no
  costs, the app shows the result and asks first. A settlement that would leave a child owing is
  refused.
- A settlement is not a cost: the trip total and each booking's paid state stay as they are. Open
  one from the list to change or delete it. Someone with a settlement cannot be removed from the
  trip; deleting the whole trip, or replacing it from a backup, deletes its settlements, and the
  confirmation says so.
- **Costs to review (0.16.1).** Once a currency has a settlement, a cost in it that nobody split is
  listed under **To review**, and that currency suggests nothing until you decide: maybe a settlement
  paid for it back when it was split. **Split it** opens the split (nothing changes until you save);
  **Keep outside** asks once and then leaves that cost out of who owes whom on purpose — your
  settlements stay exactly as they are. Kept costs are folded under **Kept outside on purpose**, with
  **Review again**. If the cost's price, payments or split change later, it comes back to review;
  renaming it or changing its notes does not.
- **Share who owes whom** sends the suggested transfers as text; a currency that is not final is
  one line without numbers. Names and balances never go into the PDF.
