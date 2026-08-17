/**
 * The prayer book seed. The Caritas Christi Prayer is the school's own
 * (smhs.org, School Charism); the rest are the traditional Catholic texts.
 * Admins maintain the live list under Admin → Faith (server-owned, synced to
 * every device); this file is only what a fresh device ships with.
 */

export interface Prayer {
  id: string;
  title: string;
  text: string;
  /** Admin-hidden (server-owned data): kept but not shown. */
  hidden?: boolean;
}

export const SEED_PRAYERS: Prayer[] = [
  {
    id: 'lenten-prayer',
    title: 'Lenten Prayer',
    text: `Almighty and Everlasting God,
You have given the human race
Jesus Christ our Savior as a model of humility.
He fulfilled Your will by becoming man
and giving His life on the cross.
Help us to bear witness to You
by following His example of suffering,
and make us worthy to share in His Resurrection.
We ask this through our Lord Jesus Christ, Your Son.

Amen.`,
  },
  {
    id: 'caritas-christi-prayer',
    title: 'Caritas Christi Prayer',
    text: `Loving God,
You know us and care for us always,
and your eternal love flows through us.
Through the Sacred Heart of Jesus,
we experience that love for humanity.

Give us a share in His compassion,
to see your image in all people.
Give us a share in His humility,
to serve and not be served.
Give us a share in His justice,
to seek righteousness and to show mercy.
Give us a share in His goodness,
to reveal your heart to others.

And remind us each day that where Caritas Christi prevails,
we will always find you by surrendering our heart to yours.

We ask this through Christ our Lord,
Amen.

St. Margaret Mary, pray for us.`,
  },
  {
    id: 'our-father',
    title: 'Our Father',
    text: `Our Father, who art in heaven,
hallowed be thy name;
thy kingdom come,
thy will be done
on earth as it is in heaven.
Give us this day our daily bread,
and forgive us our trespasses,
as we forgive those who trespass against us;
and lead us not into temptation,
but deliver us from evil.

Amen.`,
  },
  {
    id: 'hail-mary',
    title: 'Hail Mary',
    text: `Hail Mary, full of grace,
the Lord is with thee.
Blessed art thou among women,
and blessed is the fruit of thy womb, Jesus.

Holy Mary, Mother of God,
pray for us sinners,
now and at the hour of our death.

Amen.`,
  },
  {
    id: 'glory-be',
    title: 'Glory Be',
    text: `Glory be to the Father,
and to the Son,
and to the Holy Spirit.

As it was in the beginning,
is now, and ever shall be,
world without end.

Amen.`,
  },
  {
    id: 'the-apostles-creed',
    title: "The Apostles' Creed",
    text: `I believe in God,
the Father almighty,
Creator of heaven and earth,
and in Jesus Christ, his only Son, our Lord,
who was conceived by the Holy Spirit,
born of the Virgin Mary,
suffered under Pontius Pilate,
was crucified, died and was buried;
he descended into hell;
on the third day he rose again from the dead;
he ascended into heaven,
and is seated at the right hand of God the Father almighty;
from there he will come to judge the living and the dead.

I believe in the Holy Spirit,
the holy catholic Church,
the communion of saints,
the forgiveness of sins,
the resurrection of the body,
and life everlasting.

Amen.`,
  },
  {
    id: 'prayer-of-a-student',
    title: 'Prayer of A Student',
    text: `Come, Holy Spirit, Divine Creator,
true source of light and fountain of wisdom!
Pour forth your brilliance upon my dense intellect,
dissipate the darkness which covers me,
that of sin and of ignorance.

Grant me a penetrating mind to understand,
a retentive memory,
method and ease in learning,
the lucidity to comprehend,
and abundant grace in expressing myself.

Guide the beginning of my work,
direct its progress,
and bring it to successful completion.

This I ask through Jesus Christ,
true God and true man,
living and reigning with You and the Father,
forever and ever.

Amen.`,
  },
  {
    id: 'act-of-contrition',
    title: 'Act of Contrition',
    text: `O my God,
I am heartily sorry for having offended Thee,
and I detest all my sins
because of Thy just punishments,
but most of all because they offend Thee, my God,
who art all-good and deserving of all my love.

I firmly resolve, with the help of Thy grace,
to sin no more
and to avoid the near occasions of sin.

Amen.`,
  },
  {
    id: 'st-margaret-mary-of-alacoque',
    title: 'St. Margaret Mary of Alacoque',
    text: `O St. Margaret Mary,
you were permitted by the Sacred Heart of Jesus
to become the partaker of the divine treasures of His Heart.
Obtain for us, we beseech you,
from this adorable Heart,
the graces we need so sorely.

We ask for these graces with unbounded confidence
in the divine promises,
so that the Sacred Heart may be glorified
through your intercession.

Amen.

St. Margaret Mary, pray for us.`,
  },
  {
    id: 'hail-holy-queen',
    title: 'Hail Holy Queen',
    text: `Hail, holy Queen, Mother of mercy,
our life, our sweetness and our hope.
To thee do we cry, poor banished children of Eve.
To thee do we send up our sighs,
mourning and weeping in this valley of tears.

Turn then, most gracious advocate,
thine eyes of mercy toward us,
and after this our exile
show unto us the blessed fruit of thy womb, Jesus.

O clement, O loving, O sweet Virgin Mary.

Pray for us, O holy Mother of God,
that we may be made worthy of the promises of Christ.

Amen.`,
  },
];
